import { requireUser } from '../_lib/user-auth.js';
import { readJsonBody } from '../_lib/read-body.js';
import {
    checkAndAwardBadges,
    recordDecisionPick,
    createSocialReview,
    toggleReviewLike,
    addReviewComment,
    toggleCollectionLike,
} from '../_lib/social-server.js';
import { updateUserStreak, getUserStreak } from '../_lib/streak-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 30,
};

function getAction(req) {
    if (req.query?.action) return String(req.query.action);
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('social');
    return idx >= 0 ? parts[idx + 1] : null;
}

export default async function handler(req, res) {
    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }

    const action = getAction(req);

    try {
        if (req.method === 'GET' && action === 'streak') {
            const streak = await getUserStreak(auth.user.id);
            return res.status(200).json({ ok: true, streak });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (action === 'check-badges') {
            const result = await checkAndAwardBadges(auth.user.id);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'decision-pick') {
            const body = await readJsonBody(req);
            if (!body.tmdb_id || !body.title) {
                return res.status(400).json({ error: 'tmdb_id and title required' });
            }
            const result = await recordDecisionPick(auth.user.id, body);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'streak-update') {
            const result = await updateUserStreak(auth.user.id);
            const badges = await checkAndAwardBadges(auth.user.id);
            return res.status(200).json({ ok: true, ...result, badges });
        }

        if (action === 'create-review') {
            const body = await readJsonBody(req);
            if (!body.tmdb_id || !body.title || !body.content || !body.movie_title) {
                return res.status(400).json({ error: 'tmdb_id, movie_title, title, content required' });
            }
            const result = await createSocialReview(auth.user.id, body);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'review-like') {
            const body = await readJsonBody(req);
            if (!body.review_id) return res.status(400).json({ error: 'review_id required' });
            const result = await toggleReviewLike(auth.user.id, body.review_id);
            return res.status(200).json({ ok: true, ...result });
        }

        if (action === 'review-comment') {
            const body = await readJsonBody(req);
            if (!body.review_id || !body.content) {
                return res.status(400).json({ error: 'review_id and content required' });
            }
            const comment = await addReviewComment(
                auth.user.id,
                body.review_id,
                body.content,
                body.parent_id || null,
            );
            return res.status(200).json({ ok: true, comment });
        }

        if (action === 'collection-like') {
            const body = await readJsonBody(req);
            if (!body.collection_id) return res.status(400).json({ error: 'collection_id required' });
            const result = await toggleCollectionLike(auth.user.id, body.collection_id);
            return res.status(200).json({ ok: true, ...result });
        }

        // Permanently delete the caller's own account (auth user + cascaded data).
        // Requires the user to confirm by passing their exact username.
        if (action === 'delete-account') {
            const body = await readJsonBody(req);
            const { getSupabaseAdmin } = await import('../_lib/supabase-admin.js');
            const admin = getSupabaseAdmin();
            const { data: prof } = await admin
                .from('user_profiles').select('username').eq('id', auth.user.id).single();
            if (!prof || String(body.confirmUsername || '').toLowerCase() !== String(prof.username || '').toLowerCase()) {
                return res.status(400).json({ error: 'Username confirmation does not match' });
            }
            const { error: delErr } = await admin.auth.admin.deleteUser(auth.user.id);
            if (delErr) return res.status(500).json({ error: delErr.message });
            return res.status(200).json({ ok: true, deleted: true });
        }

        return res.status(404).json({
            error: 'Unknown social action',
            allowed: [
                'check-badges',
                'decision-pick',
                'streak-update',
                'streak',
                'create-review',
                'review-like',
                'review-comment',
                'collection-like',
                'delete-account',
            ],
        });
    } catch (error) {
        console.error('social handler failed:', action, error);
        return res.status(500).json({ error: error.message || 'Social request failed' });
    }
}
