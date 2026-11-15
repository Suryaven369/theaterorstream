/**
 * Landing page data (public): a hero film still that rotates daily and the
 * six hottest movies right now. Indian visitors get trending Indian titles
 * mixed in with the global list.
 */
import { fetchTmdbApi } from './tmdb-server.js';

const INDIAN_LANGS = 'hi|te|ta|ml|kn';
const HOT_COUNT = 6;
const WALL_COUNT = 18;

const safe = (promise) => promise.catch(() => null);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function card(m) {
    return {
        tmdbId: String(m.id),
        mediaType: 'movie',
        title: m.title,
        year: m.release_date ? String(m.release_date).slice(0, 4) : null,
        releaseDate: m.release_date || null,
        poster: m.poster_path,
        backdrop: m.backdrop_path,
        rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
    };
}

const released = (m) => m?.poster_path && m.backdrop_path && !m.adult
    && m.release_date && m.release_date <= today();

/** A wide still with no title text on it (falls back to the regular backdrop). */
async function textlessBackdrop(movie) {
    const images = await safe(fetchTmdbApi(`/movie/${movie.id}/images`, { include_image_language: 'null' }));
    const best = (images?.backdrops || [])
        .filter((b) => !b.iso_639_1 && b.width >= 1280)
        .sort((a, b) => (b.vote_average - a.vote_average) || (b.width - a.width))[0];
    return best?.file_path || movie.backdrop_path;
}

export async function getLandingData({ regionHint = null } = {}) {
    const [daily, weekly, indian] = await Promise.all([
        safe(fetchTmdbApi('/trending/movie/day')),
        safe(fetchTmdbApi('/trending/movie/week')),
        regionHint === 'IN'
            ? safe(fetchTmdbApi('/discover/movie', {
                with_original_language: INDIAN_LANGS,
                sort_by: 'popularity.desc',
                'primary_release_date.gte': daysAgo(90),
                'primary_release_date.lte': today(),
                'vote_count.gte': '10',
                region: 'IN',
            }))
            : Promise.resolve(null),
    ]);

    const global = [...(daily?.results || []), ...(weekly?.results || [])].filter(released);
    const regional = (indian?.results || []).filter(released);

    // Hot right now: interleave regional + global for India, global elsewhere.
    const seen = new Set();
    const hot = [];
    const take = (m) => {
        if (!m || seen.has(m.id) || hot.length >= HOT_COUNT) return;
        seen.add(m.id);
        hot.push(m);
    };
    for (let i = 0; hot.length < HOT_COUNT && (i < global.length || i < regional.length); i += 1) {
        take(regional[i]);
        take(global[i]);
    }

    // Hero: one of today's top trending films, rotating daily.
    const heroPool = global.filter((m) => (m.vote_count || 0) >= 50).slice(0, 6);
    const dayIndex = Math.floor(Date.now() / 864e5);
    const heroMovie = heroPool.length ? heroPool[dayIndex % heroPool.length] : (hot[0] || null);
    const hero = heroMovie
        ? { ...card(heroMovie), still: await textlessBackdrop(heroMovie) }
        : null;

    // Poster wall for the scrolling strip: everything trending, hot first.
    const wallSeen = new Set();
    const wall = [...hot, ...regional, ...global]
        .filter((m) => m?.poster_path && !wallSeen.has(m.id) && wallSeen.add(m.id))
        .slice(0, WALL_COUNT);

    return { hero, hot: hot.map(card), wall: wall.map(card) };
}
