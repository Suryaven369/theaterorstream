import { handleRecommendationRequest } from '../_lib/recommendation-handler.js';
import { requireUser } from '../_lib/user-auth.js';
import {
    getForYouRecommendations,
    getTonightRecommendations,
    getFamilyRecommendations,
    getTrendingPersonalized,
    getMoodRecommendations,
    getOnePerfectMovie,
    getBecauseYouLoved,
    getHiddenGems,
    getUnderratedMasterpieces,
    getOutsideComfortZone,
} from '../_lib/recommendation-server.js';
import { recordEvents, getTasteDashboard, shouldRelearn } from '../_lib/events-server.js';
import { getFollowingFeed } from '../_lib/following-feed-server.js';
import { getTastePreferences, updateTastePreferences } from '../_lib/taste-preferences-server.js';
import { rebuildUserTasteProfile } from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';

export const config = {
    runtime: 'nodejs',
    maxDuration: 60,
};

function getRouteSegments(req) {
    if (req.query?.route) {
        const route = req.query.route;
        return Array.isArray(route) ? route : [route];
    }
    const path = String(req.url || '').split('?')[0];
    const parts = path.split('/').filter(Boolean);
    const idx = parts.indexOf('recommendations');
    return idx >= 0 ? parts.slice(idx + 1) : [];
}

async function readJsonBody(req) {
    if (req.body) {
        if (typeof req.body === 'string') {
            try { return JSON.parse(req.body); } catch { return {}; }
        }
        return req.body;
    }
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
            try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });
}

async function withUser(req, res, fn) {
    const auth = await requireUser(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.message });
    }
    try {
        return await fn(auth.user.id);
    } catch (error) {
        const status = error.statusCode || 500;
        if (status >= 500) console.error('recommendation route error:', error);
        return res.status(status).json({ error: error.message || 'Request failed' });
    }
}

export default async function handler(req, res) {
    const route = getRouteSegments(req);
    const segment = route[0];

    // --- Behavioural event ingestion (fire-and-forget) ---
    if (segment === 'events') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return withUser(req, res, async (userId) => {
            const body = await readJsonBody(req);
            const events = body.events || body.event || body;
            const result = await recordEvents(userId, events);

            // Event-triggered re-learning: once enough new meaningful signals
            // accumulate, rebuild the taste profile + embedding so recommendations
            // reflect what the user just did. Debounced + non-fatal.
            let relearned = false;
            try {
                if (result.recorded > 0 && await shouldRelearn(userId)) {
                    await rebuildUserTasteProfile(userId, {
                        includeEmbedding: isEmbeddingConfigured(),
                    });
                    relearned = true;
                }
            } catch (err) {
                console.warn('[events] relearn failed:', err.message);
            }

            return res.status(200).json({ ok: true, ...result, relearned });
        });
    }

    // --- Mood-based discovery: /mood/:moodId ---
    if (segment === 'mood') {
        const moodId = route[1];
        if (!moodId) return res.status(400).json({ error: 'Missing mood id' });
        return handleRecommendationRequest(req, res, (userId, query) =>
            getMoodRecommendations(userId, moodId, query));
    }

    // --- Taste preferences (Settings) ---
    if (segment === 'taste-profile') {
        if (req.method === 'GET') {
            return withUser(req, res, async (userId) => {
                const data = await getTastePreferences(userId);
                return res.status(200).json({ ok: true, data });
            });
        }
        if (req.method === 'PUT' || req.method === 'POST') {
            return withUser(req, res, async (userId) => {
                const body = await readJsonBody(req);
                await updateTastePreferences(userId, body);
                const data = await getTastePreferences(userId);
                return res.status(200).json({ ok: true, data });
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Taste dashboard ---
    if (segment === 'dashboard') {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return withUser(req, res, async (userId) => {
            const data = await getTasteDashboard(userId);
            return res.status(200).json({ ok: true, data });
        });
    }

    // --- Core recommendation feeds (GET) ---
    if (segment === 'for-you') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getForYouRecommendations(userId, query));
    }

    if (segment === 'tonight') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getTonightRecommendations(userId, query));
    }

    if (segment === 'family') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getFamilyRecommendations(userId, query));
    }

    if (segment === 'trending-personalized') {
        return handleRecommendationRequest(req, res, (userId, query) =>
            getTrendingPersonalized(userId, query));
    }

    // One Perfect Movie Tonight — single daily pick (different shape: { movie })
    if (segment === 'perfect-tonight') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return withUser(req, res, async (userId) => {
            const data = await getOnePerfectMovie(userId);
            return res.status(200).json({ ok: true, ...data });
        });
    }

    // Following feed — new & upcoming content from followed directors/genres/franchises
    if (segment === 'following') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return withUser(req, res, async (userId) => {
            const limit = parseInt(String(req.query?.limit || '30'), 10);
            const data = await getFollowingFeed(userId, { limit });
            return res.status(200).json({ ok: true, ...data });
        });
    }

    // Discovery Feed sections
    if (segment === 'discovery') {
        const section = route[1];
        const builders = {
            'because-you-loved': getBecauseYouLoved,
            'hidden-gems': getHiddenGems,
            'underrated': getUnderratedMasterpieces,
            'outside-comfort-zone': getOutsideComfortZone,
        };
        const builder = builders[section];
        if (!builder) return res.status(404).json({ error: 'Unknown discovery section' });
        return handleRecommendationRequest(req, res, async (userId, query) => {
            const result = await builder(userId, query);
            if (!result) return { items: [], meta: { count: 0 }, generatedAt: new Date().toISOString() };
            // Surface the section heading (e.g. "Because you loved Inception") via meta.
            return { ...result, meta: { ...(result.meta || {}), heading: result.heading } };
        });
    }

    return res.status(404).json({
        error: 'Unknown recommendation route',
        allowed: [
            'for-you', 'tonight', 'family', 'trending-personalized',
            'similar/:tmdbId', 'mood/:moodId', 'perfect-tonight',
            'discovery/:section', 'events', 'taste-profile', 'dashboard',
        ],
    });
}
