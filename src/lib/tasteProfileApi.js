import { supabase } from './supabase';
import { resolveApiBase } from './apiBase';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
}

const FEEDBACK_LOG_MAX = 80;

/**
 * Merge Taste Map UI controls into onboarding_step_data (discovery level,
 * content boundaries, viewing-mode notes, feedback). Does not wipe ratings or history.
 */
export async function updateTasteMapControls(userId, patch = {}) {
    if (!userId) return { ok: false, error: 'not_signed_in' };

    const { data: existing, error: readErr } = await supabase
        .from('user_taste_profiles')
        .select('onboarding_step_data')
        .eq('user_id', userId)
        .maybeSingle();

    if (readErr) return { ok: false, error: readErr.message };

    const prev = existing?.onboarding_step_data || {};
    const step = {
        ...prev,
        ...patch,
    };

    // If caller passes appendFeedback, merge into the log instead of replacing.
    if (patch.appendFeedback && typeof patch.appendFeedback === 'object') {
        const prevLog = Array.isArray(prev.taste_feedback) ? prev.taste_feedback : [];
        const entry = {
            ...patch.appendFeedback,
            at: patch.appendFeedback.at || new Date().toISOString(),
        };
        step.taste_feedback = [...prevLog, entry].slice(-FEEDBACK_LOG_MAX);
        delete step.appendFeedback;

        const overrides = { ...(prev.taste_feature_overrides || {}) };
        const key = String(entry.feature_key || entry.feature || '').trim();
        if (key) {
            const cur = Number(overrides[key]) || 0;
            if (entry.feedback_type === 'more_like_this') overrides[key] = Math.min(1, cur + 0.15);
            else if (entry.feedback_type === 'less_like_this') overrides[key] = Math.max(-1, cur - 0.15);
            else if (entry.feedback_type === 'accurate') overrides[key] = Math.min(1, cur + 0.05);
            else if (entry.feedback_type === 'inaccurate') overrides[key] = Math.max(-1, cur - 0.2);
            else if (entry.feedback_type === 'depends_on_mood') overrides[key] = cur; // flag only
            step.taste_feature_overrides = overrides;
        }
    }

    if (Array.isArray(patch.dismissed_insights)) {
        step.dismissed_insights = [...new Set(patch.dismissed_insights)].slice(-100);
    }
    if (Array.isArray(patch.confirmed_insights)) {
        step.confirmed_insights = [...new Set(patch.confirmed_insights)].slice(-100);
    }

    const { error } = await supabase
        .from('user_taste_profiles')
        .upsert(
            {
                user_id: userId,
                onboarding_step_data: step,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
        );

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: step };
}

/**
 * Fire-and-forget taste profile rebuild after ratings or onboarding.
 * Failures are logged only — never blocks the UI.
 */
export async function requestTasteProfileRebuild(options = {}) {
    const token = await getAccessToken();
    if (!token) return { skipped: true, reason: 'not_signed_in' };

    const url = `${resolveApiBase()}/api/taste/rebuild`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                includeEmbedding: !!options.includeEmbedding,
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            if (import.meta.env.DEV) {
                console.warn('[taste-rebuild]', payload.error || response.status);
            }
            return { ok: false, error: payload.error };
        }

        return { ok: true, ...(await response.json()) };
    } catch (error) {
        if (import.meta.env.DEV) {
            console.warn('[taste-rebuild]', error.message);
        }
        return { ok: false, error: error.message };
    }
}
