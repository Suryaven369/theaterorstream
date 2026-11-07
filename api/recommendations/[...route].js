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
    getTonightPicks,
    getQueueByFit,
    getTosVerdict,
} from '../_lib/recommendation-server.js';
import {
    recordEvents,
    getTasteDashboard,
    shouldRelearn,
    shouldRebuildForLikes,
    CACHE_BUST_EVENTS,
} from '../_lib/events-server.js';
import { getFollowingFeed } from '../_lib/following-feed-server.js';
import { getTastePreferences, updateTastePreferences } from '../_lib/taste-preferences-server.js';
import { rebuildUserTasteProfile, invalidateRecommendationCache, isTasteProfileStale } from '../_lib/taste-profile-server.js';
import { isEmbeddingConfigured } from '../_lib/embedding-server.js';
import { handleRecoChat, RECO_CHAT_PRESETS } from '../_lib/reco-chat-server.js';
import { getUserStreamingSetup, saveUserStreamingSetup } from '../_lib/streaming-services-server.js';
import { getHomeFeed } from '../_lib/home-feed-server.js';
import { fetchTmdbApi } from '../_lib/tmdb-server.js';
import { getRegionProviderCatalog, normalizeRegion, DEFAULT_REGION } from '../_lib/watch-providers-server.js';

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

            const list = Array.isArray(events) ? events : [events];
            const types = list.map((e) => String(e?.eventType || e?.event_type || ''));
            const hasLike = types.includes('movie_liked');
            const hasRatingOrDislike = types.some(
                (t) => CACHE_BUST_EVENTS.has(t) || t.startsWith('rated_'),
            );
            // Likes: only re-analyse after ≥3 hearts. Watches never bust cache.
            const likesReady = hasLike ? await shouldRebuildForLikes(userId) : false;
            const shouldBustCache = result.recorded > 0 && (hasRatingOrDislike || likesReady);

            if (shouldBustCache) {
                try {
                    await invalidateRecommendationCache(null, userId);
                } catch (err) {
                    console.warn('[events] cache invalidate failed:', err.message);
                }
            }

            let relearned = false;
            try {
                const hasRating = types.some((t) => t.startsWith('rated_'));
                const hasDislike = types.includes('movie_disliked');
                const mayRelearn = hasRating || hasDislike || likesReady;
                if (result.recorded > 0 && mayRelearn && await shouldRelearn(userId)) {
                    await rebuildUserTasteProfile(userId, {
                        includeEmbedding: isEmbeddingConfigured(),
                    });
                    relearned = true;
                }
            } catch (err) {
                console.warn('[events] relearn failed:', err.message);
            }

            return res.status(200).json({ ok: true, ...result, relearned, likesReady });
        });
    }

    // --- Mood-based discovery: /mood/:moodId ---
    // Supports optional OTT: providerId=<tmdbId> or ottMode=true (user's linked services).
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
                await updateTastePreferences(userId, body); // throws 400 on invalid quiz
                const data = await getTastePreferences(userId);
                return res.status(200).json({ ok: true, data });
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Feed tab: friends' films, new trailers, latest news (sign-in optional) ---
    if (segment === 'home') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const auth = req.headers?.authorization ? await requireUser(req) : { ok: false };
            const userId = auth.ok ? auth.user.id : null;
            const data = await getHomeFeed(userId);
            res.setHeader('Cache-Control', userId
                ? 'private, max-age=60'
                : 'public, s-maxage=300, stale-while-revalidate=900');
            return res.status(200).json({ ok: true, ...data });
        } catch (error) {
            console.error('home feed failed:', error);
            return res.status(500).json({ error: error.message || 'Could not load the feed' });
        }
    }

    // --- TOS verdict: Theater / Wait for OTT / Skip (sign-in optional for personal fit) ---
    if (segment === 'tos-verdict') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const tmdbId = route[1];
        if (!/^\d+$/.test(String(tmdbId || ''))) return res.status(400).json({ error: 'Missing title id' });
        try {
            const auth = req.headers?.authorization ? await requireUser(req) : { ok: false };
            const hint = String(req.query?.regionHint || '').toUpperCase();
            const data = await getTosVerdict(tmdbId, {
                mediaType: req.query?.mediaType === 'tv' ? 'tv' : 'movie',
                userId: auth.ok ? auth.user.id : null,
                regionHint: /^[A-Z]{2}$/.test(hint) ? hint : null,
            });
            res.setHeader('Cache-Control', auth.ok ? 'private, max-age=300' : 'public, s-maxage=3600, stale-while-revalidate=7200');
            return res.status(200).json({ ok: true, data });
        } catch (error) {
            const status = error.statusCode || 500;
            if (status >= 500) console.error('tos-verdict failed:', error);
            return res.status(status).json({ error: error.message || 'Could not compute verdict' });
        }
    }

    // --- Personal queue (watchlist) sorted by fit for tonight ---
    if (segment === 'queue') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return withUser(req, res, async (userId) => {
            const q = req.query || {};
            const hint = String(q.regionHint || '').toUpperCase();
            const data = await getQueueByFit(userId, {
                minutes: Number(q.minutes) || null,
                mood: q.mood ? String(q.mood) : undefined,
                company: q.company ? String(q.company) : undefined,
                regionHint: /^[A-Z]{2}$/.test(hint) ? hint : null,
            });
            return res.status(200).json({ ok: true, ...data });
        });
    }

    // --- Tonight: 3 taps (mood, time, company) → exactly 3 picks ---
    if (segment === 'tonight-picks') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return withUser(req, res, async (userId) => {
            const q = req.query || {};
            const hint = String(q.regionHint || '').toUpperCase();
            const data = await getTonightPicks(userId, {
                mood: String(q.mood || 'any'),
                minutes: Number(q.minutes) || null,
                company: String(q.company || 'solo'),
                regionHint: /^[A-Z]{2}$/.test(hint) ? hint : null,
            });
            return res.status(200).json({ ok: true, ...data });
        });
    }

    // --- Taste quiz movie search (TMDB /search/movie, server-side key) ---
    if (segment === 'movie-search') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const q = String(req.query?.q || '').trim().slice(0, 80);
        if (q.length < 2) return res.status(200).json({ ok: true, data: [] });
        try {
            const data = await fetchTmdbApi('/search/movie', { query: q, include_adult: 'false', page: '1' });
            const results = (data?.results || [])
                .filter((m) => m.poster_path && (m.vote_count || 0) >= 5)
                .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                .slice(0, 12)
                .map((m) => ({
                    id: m.id,
                    title: m.title,
                    year: m.release_date ? Number(String(m.release_date).slice(0, 4)) : null,
                    lang: m.original_language,
                    poster: m.poster_path,
                    genreIds: m.genre_ids || [],
                }));
            res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=172800');
            return res.status(200).json({ ok: true, data: results });
        } catch (error) {
            console.warn('movie-search failed:', error.message);
            return res.status(200).json({ ok: true, data: [], degraded: true });
        }
    }

    // --- Streaming services (OTT subscriptions + region) ---
    if (segment === 'streaming-services') {
        if (req.method === 'GET') {
            return withUser(req, res, async (userId) => {
                const data = await getUserStreamingSetup(userId);
                return res.status(200).json({ ok: true, data });
            });
        }
        if (req.method === 'PUT' || req.method === 'POST') {
            return withUser(req, res, async (userId) => {
                const body = await readJsonBody(req);
                const data = await saveUserStreamingSetup(userId, body);
                return res.status(200).json({ ok: true, data });
            });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // --- Streaming services available in a region (for the picker) ---
    if (segment === 'providers') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const region = normalizeRegion(req.query?.region) || DEFAULT_REGION;
            const providers = await getRegionProviderCatalog(region);
            res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
            return res.status(200).json({ ok: true, region, data: providers });
        } catch (error) {
            console.error('providers catalog failed:', error);
            return res.status(500).json({ error: error.message || 'Could not load providers' });
        }
    }

    // --- Taste dashboard ---
    if (segment === 'dashboard') {
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return withUser(req, res, async (userId) => {
            // Never show a stale Taste Map: rebuild first if anything changed.
            try {
                if (await isTasteProfileStale(userId)) {
                    await rebuildUserTasteProfile(userId, { includeEmbedding: false });
                }
            } catch (err) {
                console.warn('[dashboard] pre-rebuild failed:', err.message);
            }
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
            const hint = String(req.query?.regionHint || '').toUpperCase();
            const data = await getOnePerfectMovie(userId, /^[A-Z]{2}$/.test(hint) ? { regionHint: hint } : {});
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

    // Reco chat bubble — preset / free-text → personalized picks
    if (segment === 'chat') {
        if (req.method === 'GET') {
            return res.status(200).json({ ok: true, presets: RECO_CHAT_PRESETS });
        }
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        return withUser(req, res, async (userId) => {
            const body = await readJsonBody(req);
            const started = Date.now();
            console.info('[reco-chat] start', {
                userId: userId.slice(0, 8),
                hasMessage: !!(body.message || body.text),
                historyLen: Array.isArray(body.history) ? body.history.length : 0,
            });
            const data = await handleRecoChat(userId, {
                message: body.message || body.text || '',
                history: body.history || [],
                limit: body.limit,
            });
            console.info('[reco-chat] done', {
                ms: Date.now() - started,
                mode: data?.mode || data?.meta?.mode,
                count: data?.items?.length ?? 0,
                llmUsed: !!data?.meta?.llmUsed,
            });
            return res.status(200).json({ ok: true, ...data });
        });
    }

    return res.status(404).json({
        error: 'Unknown recommendation route',
        allowed: [
            'for-you', 'tonight', 'family', 'trending-personalized',
            'similar/:tmdbId', 'mood/:moodId', 'perfect-tonight',
            'discovery/:section', 'events', 'taste-profile', 'dashboard',
            'chat', 'streaming-services', 'providers', 'home', 'tonight-picks', 'movie-search', 'queue', 'tos-verdict/:tmdbId',
        ],
    });
}
