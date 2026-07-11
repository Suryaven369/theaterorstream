-- Admin Audit Logs + Security Enhancements
-- Tracks all admin actions for security and compliance

-- =============================================
-- ADMIN AUDIT LOGS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    action text NOT NULL,
    resource_type text,
    resource_id text,
    old_value jsonb,
    new_value jsonb,
    ip_address inet,
    user_agent text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_admin_date ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON admin_audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_created ON admin_audit_logs(created_at DESC);

-- RLS: Only admins can read audit logs
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
    ON admin_audit_logs FOR SELECT
    USING (public.is_admin_user());

CREATE POLICY "Service role can insert audit logs"
    ON admin_audit_logs FOR INSERT
    WITH CHECK (true);

-- =============================================
-- RATE LIMITING TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS admin_rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL,
    action_type text NOT NULL,
    request_count integer DEFAULT 1,
    window_start timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

-- Unique constraint for rate limit windows
CREATE UNIQUE INDEX idx_rate_limits_identifier_action_window 
    ON admin_rate_limits(identifier, action_type, date_trunc('minute', window_start));

-- Cleanup old rate limit entries (older than 1 hour)
CREATE INDEX idx_rate_limits_cleanup ON admin_rate_limits(window_start);

-- RLS: Service role only
ALTER TABLE admin_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages rate limits"
    ON admin_rate_limits FOR ALL
    USING (true)
    WITH CHECK (true);

-- =============================================
-- ADMIN SESSIONS TABLE (for enhanced security)
-- =============================================

CREATE TABLE IF NOT EXISTS admin_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token text NOT NULL,
    device_fingerprint text,
    ip_address inet,
    user_agent text,
    last_activity_at timestamptz DEFAULT now(),
    expires_at timestamptz NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_admin_sessions_admin ON admin_sessions(admin_id, is_active);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token) WHERE is_active = true;
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at) WHERE is_active = true;

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages admin sessions"
    ON admin_sessions FOR ALL
    USING (true)
    WITH CHECK (true);

-- =============================================
-- ADMIN INDEXES FOR PERFORMANCE
-- =============================================

-- Movies library admin queries
CREATE INDEX IF NOT EXISTS idx_movies_library_admin_list 
    ON movies_library(is_active, media_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_movies_library_synced 
    ON movies_library(synced_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_movies_library_featured 
    ON movies_library(featured, popularity DESC) WHERE featured = true;

CREATE INDEX IF NOT EXISTS idx_movies_library_priority 
    ON movies_library(priority DESC NULLS LAST, popularity DESC);

-- Sync runs admin queries
CREATE INDEX IF NOT EXISTS idx_sync_runs_job_date 
    ON tmdb_sync_runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_status 
    ON tmdb_sync_runs(status, started_at DESC);

-- Content events admin queries
CREATE INDEX IF NOT EXISTS idx_content_events_status_date 
    ON content_events(status, created_at DESC);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to log admin actions (called from API)
CREATE OR REPLACE FUNCTION log_admin_action(
    p_admin_id uuid,
    p_action text,
    p_resource_type text DEFAULT NULL,
    p_resource_id text DEFAULT NULL,
    p_old_value jsonb DEFAULT NULL,
    p_new_value jsonb DEFAULT NULL,
    p_ip_address inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO admin_audit_logs (
        admin_id, action, resource_type, resource_id,
        old_value, new_value, ip_address, user_agent, metadata
    ) VALUES (
        p_admin_id, p_action, p_resource_type, p_resource_id,
        p_old_value, p_new_value, p_ip_address, p_user_agent, p_metadata
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_identifier text,
    p_action_type text,
    p_max_requests integer DEFAULT 100,
    p_window_minutes integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_window_start timestamptz;
    v_count integer;
BEGIN
    v_window_start := date_trunc('minute', now());
    
    -- Upsert rate limit record
    INSERT INTO admin_rate_limits (identifier, action_type, request_count, window_start)
    VALUES (p_identifier, p_action_type, 1, v_window_start)
    ON CONFLICT (identifier, action_type, date_trunc('minute', window_start))
    DO UPDATE SET request_count = admin_rate_limits.request_count + 1
    RETURNING request_count INTO v_count;
    
    -- Check if over limit
    RETURN v_count <= p_max_requests;
END;
$$;

-- Function to cleanup old rate limits (run periodically)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM admin_rate_limits
    WHERE window_start < now() - interval '1 hour';
END;
$$;

-- =============================================
-- ADMIN ANALYTICS VIEW
-- =============================================

CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
    (SELECT count(*) FROM movies_library WHERE is_active = true) AS total_active_movies,
    (SELECT count(*) FROM movies_library WHERE is_active = true AND media_type = 'movie') AS total_movies,
    (SELECT count(*) FROM movies_library WHERE is_active = true AND media_type = 'tv') AS total_tv_shows,
    (SELECT count(*) FROM movies_library WHERE featured = true) AS featured_count,
    (SELECT count(*) FROM movies_library WHERE synced_at > now() - interval '7 days') AS synced_this_week,
    (SELECT count(*) FROM movies_library WHERE created_at > now() - interval '7 days') AS added_this_week,
    (SELECT count(*) FROM user_profiles) AS total_users,
    (SELECT count(*) FROM user_profiles WHERE created_at > now() - interval '7 days') AS new_users_this_week,
    (SELECT count(*) FROM ratings) AS total_ratings,
    (SELECT count(*) FROM ratings WHERE created_at > now() - interval '24 hours') AS ratings_today,
    (SELECT count(*) FROM movie_logs) AS total_logs,
    (SELECT count(*) FROM movie_logs WHERE created_at > now() - interval '24 hours') AS logs_today,
    (SELECT count(*) FROM tmdb_sync_runs WHERE status = 'completed' AND started_at > now() - interval '7 days') AS successful_syncs_this_week,
    (SELECT count(*) FROM tmdb_sync_runs WHERE status = 'failed' AND started_at > now() - interval '7 days') AS failed_syncs_this_week,
    (SELECT max(started_at) FROM tmdb_sync_runs WHERE status = 'completed') AS last_successful_sync,
    (SELECT count(*) FROM content_events WHERE status = 'pending') AS pending_events;

-- Grant access to admin view
GRANT SELECT ON admin_dashboard_stats TO authenticated;
