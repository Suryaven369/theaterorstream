// "Following" discovery feed — surfaces NEW & UPCOMING content from the
// directors, genres, franchises (TMDB collections) and actors a user follows.
// Aggregates per-entity TMDB queries, dedupes, tags each item with WHY it's
// shown, and sorts upcoming-soonest → newest.
import { fetchTmdbApi } from './tmdb-server.js';
import { getSupabaseAdmin } from './supabase-admin.js';

const DAY = 86_400_000;
const RECENT_DAYS = 150;   // released within ~5 months counts as "new"
const FUTURE_DAYS = 420;   // upcoming within ~14 months
const MAX_ENTITIES = 14;   // cap TMDB fan-out per request
const PER_ENTITY = 8;

const iso = (d) => d.toISOString().slice(0, 10);

function withinWindow(dateStr) {
    if (!dateStr) return false;
    const t = new Date(dateStr).getTime();
    if (Number.isNaN(t)) return false;
    const now = Date.now();
    return t >= now - RECENT_DAYS * DAY && t <= now + FUTURE_DAYS * DAY;
}

function card(raw, mediaType, reason) {
    const date = raw.release_date || raw.first_air_date || null;
    return {
        tmdb_id: String(raw.id),
        media_type: mediaType,
        title: raw.title || raw.name,
        poster_path: raw.poster_path || null,
        backdrop_path: raw.backdrop_path || null,
        release_date: date,
        vote_average: raw.vote_average ?? null,
        overview: raw.overview || '',
        upcoming: date ? new Date(date).getTime() > Date.now() : false,
        reasons: [reason],
    };
}

async function mapWithConcurrency(items, limit, fn) {
    const out = [];
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            try { out.push(...(await fn(items[idx])) || []); } catch { /* skip one entity */ }
        }
    });
    await Promise.all(workers);
    return out;
}

async function fetchForEntity(follow) {
    const now = new Date();
    const gte = iso(new Date(now.getTime() - RECENT_DAYS * DAY));
    const lte = iso(new Date(now.getTime() + FUTURE_DAYS * DAY));
    const reason = { type: follow.target_type, id: follow.target_id, label: follow.target_label };

    switch (follow.target_type) {
        case 'genre': {
            const [movies, tv] = await Promise.all([
                fetchTmdbApi('/discover/movie', {
                    with_genres: follow.target_id, sort_by: 'primary_release_date.desc',
                    'vote_count.gte': '10', 'primary_release_date.gte': gte, 'primary_release_date.lte': lte,
                    include_adult: 'false',
                }),
                fetchTmdbApi('/discover/tv', {
                    with_genres: follow.target_id, sort_by: 'first_air_date.desc',
                    'vote_count.gte': '10', 'first_air_date.gte': gte, 'first_air_date.lte': lte,
                }),
            ]);
            return [
                ...(movies?.results || []).slice(0, PER_ENTITY).map((m) => card(m, 'movie', { ...reason, text: `New in ${follow.target_label}` })),
                ...(tv?.results || []).slice(0, 4).map((t) => card(t, 'tv', { ...reason, text: `New in ${follow.target_label}` })),
            ];
        }
        case 'director': {
            const credits = await fetchTmdbApi(`/person/${follow.target_id}/movie_credits`);
            return (credits?.crew || [])
                .filter((c) => c.job === 'Director' && withinWindow(c.release_date))
                .slice(0, PER_ENTITY)
                .map((m) => card(m, 'movie', { ...reason, text: `New from ${follow.target_label}` }));
        }
        case 'actor':
        case 'creator': {
            const credits = await fetchTmdbApi(`/person/${follow.target_id}/combined_credits`);
            return (credits?.cast || [])
                .filter((c) => withinWindow(c.release_date || c.first_air_date))
                .slice(0, PER_ENTITY)
                .map((c) => card(c, c.media_type === 'tv' ? 'tv' : 'movie', { ...reason, text: `${follow.target_label}'s latest` }));
        }
        case 'franchise': {
            const col = await fetchTmdbApi(`/collection/${follow.target_id}`);
            return (col?.parts || [])
                .filter((p) => withinWindow(p.release_date))
                .slice(0, PER_ENTITY)
                .map((p) => card(p, 'movie', { ...reason, text: `New in ${follow.target_label || col.name}` }));
        }
        default:
            return [];
    }
}

export async function getFollowingFeed(userId, { limit = 30 } = {}) {
    const supabase = getSupabaseAdmin();
    const { data: follows, error } = await supabase
        .from('entity_follows')
        .select('target_type, target_id, target_label')
        .eq('user_id', userId)
        .in('target_type', ['genre', 'director', 'actor', 'franchise', 'creator', 'board'])
        .order('created_at', { ascending: false })
        .limit(MAX_ENTITIES);

    if (error || !follows?.length) {
        return { items: [], followCount: 0, boardUpdates: [], generatedAt: new Date().toISOString() };
    }

    const entityFollows = follows.filter((f) => f.target_type !== 'board');
    const boardFollows = follows.filter((f) => f.target_type === 'board');

    const raw = await mapWithConcurrency(entityFollows, 4, fetchForEntity);

    // Board activity for followed boards
    let boardUpdates = [];
    if (boardFollows.length) {
        const boardIds = boardFollows.map((f) => f.target_id);
        const { data: activity } = await supabase
            .from('board_activity')
            .select('id, board_id, actor_id, event_type, payload, created_at')
            .in('board_id', boardIds)
            .order('created_at', { ascending: false })
            .limit(20);

        const { data: boards } = await supabase
            .from('boards')
            .select('id, title, slug, cover_image, user_id, is_public, items_count')
            .in('id', boardIds)
            .eq('is_public', true);

        const boardMap = new Map((boards || []).map((b) => [b.id, b]));
        const ownerIds = [...new Set((boards || []).map((b) => b.user_id))];
        let profiles = [];
        if (ownerIds.length) {
            const { data } = await supabase
                .from('user_profiles')
                .select('id, username, display_name')
                .in('id', ownerIds);
            profiles = data || [];
        }
        const profileMap = new Map(profiles.map((p) => [p.id, p]));

        boardUpdates = (activity || [])
            .map((a) => {
                const board = boardMap.get(a.board_id);
                if (!board) return null;
                const owner = profileMap.get(board.user_id);
                const label = boardFollows.find((f) => f.target_id === a.board_id)?.target_label || board.title;
                return {
                    kind: 'board_activity',
                    id: a.id,
                    event_type: a.event_type,
                    payload: a.payload,
                    created_at: a.created_at,
                    board: {
                        ...board,
                        username: owner?.username || null,
                        path: owner?.username ? `/${owner.username}/boards/${board.slug}` : `/boards/${board.slug}`,
                    },
                    reason: { type: 'board', id: board.id, label, text: `Update on ${label}` },
                };
            })
            .filter(Boolean);
    }

    // Dedupe by media+id, merging the reasons (a title can match several follows).
    const byKey = new Map();
    for (const c of raw) {
        if (!c.tmdb_id || !c.title || !c.poster_path) continue;
        const key = `${c.media_type}:${c.tmdb_id}`;
        const prev = byKey.get(key);
        if (prev) {
            if (!prev.reasons.some((r) => r.text === c.reasons[0].text)) prev.reasons.push(c.reasons[0]);
        } else {
            byKey.set(key, c);
        }
    }

    // Upcoming soonest first, then most-recent releases.
    const items = [...byKey.values()].sort((a, b) => {
        if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
        const da = new Date(a.release_date || 0).getTime();
        const db = new Date(b.release_date || 0).getTime();
        return a.upcoming ? da - db : db - da;
    }).slice(0, limit);

    return { items, followCount: follows.length, boardUpdates, generatedAt: new Date().toISOString() };
}
