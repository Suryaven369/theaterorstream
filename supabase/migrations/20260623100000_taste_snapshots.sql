-- Taste Evolution: periodic snapshots of a user's taste so we can show how
-- their interests shift over time (Thriller +12%, Sci-Fi -4%, ...).

CREATE TABLE IF NOT EXISTS public.taste_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  genre_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  dna_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  mood_preferences jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.taste_snapshots IS
  'Weekly snapshot of a user taste profile, for the Taste Evolution dashboard.';

CREATE INDEX IF NOT EXISTS idx_taste_snapshots_user_time
  ON public.taste_snapshots (user_id, captured_at DESC);

ALTER TABLE public.taste_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own taste snapshots" ON public.taste_snapshots;
CREATE POLICY "Users read own taste snapshots" ON public.taste_snapshots
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Writes via service role only (weekly cron).
