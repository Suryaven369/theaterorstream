/**
 * Feed tab ("home") — a short, Letterboxd-style page instead of an endless feed:
 *   1. New from friends  — what people you follow watched / logged / rated
 *   2. New trailers      — the most popular trailers released this fortnight
 *   3. Latest news       — 3 real news stories, linking out to the source
 * (Latest public lists are loaded on the client from the existing helper.)
 */
import { getSupabaseAdmin } from './supabase-admin.js';
import { fetchRssTrailers } from './content-server.js';

const FRIENDS_LIMIT = 12;
const TRAILER_LIMIT = 4;
const NEWS_LIMIT = 3;

// ---------------------------------------------------------------------------
// New from friends
// ---------------------------------------------------------------------------

/**
 * Recent films from people the user follows. Guests (or users who follow no
 * one) get "Popular with members" — the same row from everyone public.
 */
export async function getFriendsActivity(userId, { limit = FRIENDS_LIMIT } = {}) {
    const supabase = getSupabaseAdmin();

    let followingIds = [];
    if (userId) {
        const { data } = await supabase
            .from('user_follows')
            .select('following_id')
            .eq('follower_id', userId)
            .limit(500);
        followingIds = [...new Set((data || []).map((r) => r.following_id).filter(Boolean))];
    }
    const mode = followingIds.length ? 'friends' : 'community';

    const scope = (query, col = 'user_id') => {
        if (mode === 'friends') return query.in(col, followingIds);
        return userId ? query.neq(col, userId) : query;
    };

    const [logsRes, watchedRes, likedRes] = await Promise.all([
        scope(supabase
            .from('movie_logs')
            .select('user_id, tmdb_id, media_type, movie_title, poster_path, rating, review_text, created_at, season_number')
            .eq('visibility', 'public')
            .order('created_at', { ascending: false })
            .limit(120)),
        scope(supabase
            .from('user_watched_movies')
            .select('user_id, movie_id, media_type, movie_title, poster_path, watched_at')
            .order('watched_at', { ascending: false })
            .limit(120)),
        scope(supabase
            .from('user_liked_movies')
            .select('user_id, movie_id, liked_at')
            .order('liked_at', { ascending: false })
            .limit(200)),
    ]);

    const liked = new Set((likedRes.data || []).map((r) => `${r.user_id}:${r.movie_id}`));
    const entries = new Map(); // `${user}:${tmdb}` → entry
    const upsert = (userKey, tmdbId, patch) => {
        if (!tmdbId) return;
        const key = `${userKey}:${tmdbId}`;
        const prev = entries.get(key);
        if (!prev) {
            entries.set(key, { userId: userKey, tmdbId: String(tmdbId), ...patch });
            return;
        }
        // Keep the newest timestamp; fill rating / review from the diary log.
        if (patch.at && (!prev.at || patch.at > prev.at)) prev.at = patch.at;
        if (patch.rating != null && prev.rating == null) prev.rating = patch.rating;
        if (patch.reviewed) prev.reviewed = true;
        prev.posterPath = prev.posterPath || patch.posterPath;
        prev.title = prev.title || patch.title;
    };

    (logsRes.data || []).forEach((r) => upsert(r.user_id, r.tmdb_id, {
        mediaType: r.media_type === 'tv' ? 'tv' : 'movie',
        title: r.movie_title,
        posterPath: r.poster_path,
        rating: r.rating != null ? Number(r.rating) : null,
        reviewed: !!(r.review_text && String(r.review_text).trim()),
        at: r.created_at,
    }));
    (watchedRes.data || []).forEach((r) => upsert(r.user_id, r.movie_id, {
        mediaType: r.media_type === 'tv' ? 'tv' : 'movie',
        title: r.movie_title,
        posterPath: r.poster_path,
        rating: null,
        reviewed: false,
        at: r.watched_at,
    }));

    const userIds = [...new Set([...entries.values()].map((e) => e.userId))];
    if (!userIds.length) return { mode, items: [] };

    const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url, avatar_id, activity_visibility')
        .in('id', userIds);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));

    // Respect activity privacy: friends may see "followers" activity; the
    // community row only shows public activity.
    const visible = (p) => {
        const vis = p?.activity_visibility || 'public';
        if (vis === 'private') return false;
        if (vis === 'followers') return mode === 'friends';
        return true;
    };

    // One card per film (newest friend wins) so the row stays varied.
    const seenFilms = new Set();
    const items = [];
    [...entries.values()]
        .filter((e) => e.posterPath && e.title && visible(byId.get(e.userId)))
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
        .forEach((e) => {
            if (items.length >= limit || seenFilms.has(e.tmdbId)) return;
            seenFilms.add(e.tmdbId);
            const p = byId.get(e.userId) || {};
            items.push({
                tmdbId: e.tmdbId,
                mediaType: e.mediaType,
                title: e.title,
                posterPath: e.posterPath,
                rating: e.rating,
                reviewed: e.reviewed,
                liked: liked.has(`${e.userId}:${e.tmdbId}`),
                at: e.at,
                user: {
                    username: p.username || null,
                    name: p.display_name || p.username || 'Member',
                    avatarUrl: p.avatar_url || null,
                    avatarId: p.avatar_id || null,
                },
            });
        });

    return { mode, items };
}

// ---------------------------------------------------------------------------
// New trailers — most popular launches of the last two weeks
// ---------------------------------------------------------------------------

export async function getPopularNewTrailers({ limit = TRAILER_LIMIT } = {}) {
    const { data: trailers } = await fetchRssTrailers({ limit: 60, daysBack: 14 });
    const list = (trailers || []).filter((t) => t.featured_trailer?.key);
    if (!list.length) return [];

    const supabase = getSupabaseAdmin();
    const { data: rows } = await supabase
        .from('movies_library')
        .select('tmdb_id, media_type, popularity')
        .in('tmdb_id', [...new Set(list.map((t) => String(t.tmdb_id)))]);
    const popularity = new Map((rows || []).map((r) => [`${r.media_type || 'movie'}:${r.tmdb_id}`, Number(r.popularity) || 0]));

    const seen = new Set();
    return list
        .map((t) => ({ ...t, _pop: popularity.get(`${t.media_type || 'movie'}:${t.tmdb_id}`) || 0 }))
        .sort((a, b) => (b._pop - a._pop)
            || String(b.featured_trailer.published_at || '').localeCompare(String(a.featured_trailer.published_at || '')))
        .filter((t) => {
            const key = `${t.media_type}:${t.tmdb_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit)
        .map((t) => ({
            tmdbId: String(t.tmdb_id),
            mediaType: t.media_type === 'tv' ? 'tv' : 'movie',
            title: t.title,
            releaseDate: t.release_date || null,
            trailerName: t.featured_trailer.name || 'Trailer',
            youtubeKey: t.featured_trailer.key,
            thumbnail: t.featured_trailer.thumbnail,
            thumbnailFallback: t.featured_trailer.thumbnailFallback,
            publishedAt: t.featured_trailer.published_at || null,
        }));
}

// ---------------------------------------------------------------------------
// Latest news — 3 real stories, brief from the source, link out
// ---------------------------------------------------------------------------

const TWITTER_LINK = /nitter\.|\/\/(?:www\.)?(?:twitter|x)\.com\b|rsshub\.app\/twitter/i;
const SKIP_SOURCES = /google trends|discussing film/i;
// Listicles / quote roundups aren't news ("10 Best…", "7 Most Iconic…").
const NOT_NEWS = /^(?:the\s+)?\d+\s|\b(?:ranked|quotes?|comics?|memes?)\b|\bbest\b.*\bof all time\b/i;

function stripHtml(text) {
    return String(text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function brief(text, max = 220) {
    const clean = stripHtml(text);
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[,.;:\s]+$/, '')}…`;
}

async function queryNews(supabase, { sinceDays }) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const { data, error } = await supabase
        .from('feed_articles')
        .select('id, title, summary, image_url, link, source_name, source_logo_url, published_at, status, is_active')
        .is('tmdb_id', null)
        .neq('status', 'rejected')
        .not('image_url', 'is', null)
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(150);
    if (error) throw new Error(error.message);
    return data || [];
}

export async function getHomeNews({ limit = NEWS_LIMIT } = {}) {
    const supabase = getSupabaseAdmin();
    let rows = await queryNews(supabase, { sinceDays: 14 });
    if (rows.length < 20) rows = await queryNews(supabase, { sinceDays: 120 });

    const picked = [];
    const sources = new Set();
    for (const a of rows) {
        if (picked.length >= limit) break;
        if (a.status === 'approved' && a.is_active === false) continue; // admin hid it
        if (!a.link || TWITTER_LINK.test(a.link)) continue;
        if (SKIP_SOURCES.test(a.source_name || '')) continue;
        if (NOT_NEWS.test(a.title || '')) continue;
        const text = brief(a.summary);
        if (text.length < 60) continue;
        // One story per outlet keeps the row varied.
        const src = String(a.source_name || '').toLowerCase();
        if (sources.has(src)) continue;
        sources.add(src);
        picked.push({
            id: a.id,
            title: stripHtml(a.title),
            brief: text,
            image: a.image_url,
            url: a.link,
            source: a.source_name || 'Source',
            sourceLogo: a.source_logo_url || null,
            publishedAt: a.published_at,
        });
    }
    return picked;
}

/** Everything the Feed tab needs in one call. Each section fails independently. */
export async function getHomeFeed(userId) {
    const [friends, trailers, news] = await Promise.all([
        getFriendsActivity(userId).catch((err) => {
            console.warn('[home] friends failed:', err.message);
            return { mode: 'community', items: [] };
        }),
        getPopularNewTrailers().catch((err) => {
            console.warn('[home] trailers failed:', err.message);
            return [];
        }),
        getHomeNews().catch((err) => {
            console.warn('[home] news failed:', err.message);
            return [];
        }),
    ]);
    return { friends, trailers, news, generatedAt: new Date().toISOString() };
}
