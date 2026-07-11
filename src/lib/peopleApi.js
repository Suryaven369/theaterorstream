// TMDB people (directors / actors / creators) — used for favorite directors and
// for following people. Routes through the /api/tmdb proxy (key stays server-side).
import { tmdbFetch } from './tmdbApi';

const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';

function normalizePerson(p) {
    return {
        id: String(p.id),
        name: p.name,
        profile_path: p.profile_path,
        profile_url: p.profile_path ? `${PROFILE_BASE}${p.profile_path}` : null,
        known_for_department: p.known_for_department,
        known_for: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 3),
    };
}

/** Search TMDB people. `dept` optionally filters (e.g. 'Directing'). */
export async function searchPeople(query, { limit = 8, dept = null } = {}) {
    if (!query || query.trim().length < 2) return [];
    try {
        const data = await tmdbFetch('/search/person', { query: query.trim(), include_adult: 'false' });
        let results = (data?.results || []).map(normalizePerson);
        if (dept) {
            results = results.sort((a, b) =>
                (b.known_for_department === dept) - (a.known_for_department === dept));
        }
        return results.slice(0, limit);
    } catch {
        return [];
    }
}

/** Get a person's detail (name + profile) by id — for hydrating followed people. */
export async function getPerson(personId) {
    try {
        const p = await tmdbFetch(`/person/${personId}`);
        return normalizePerson(p);
    } catch {
        return null;
    }
}
