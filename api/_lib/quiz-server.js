/**
 * Taste onboarding helpers (public, no auth):
 *  - getQuizStarters: well-known films in the languages the user picked, so the
 *    "movies you loved" grid starts in their languages.
 *  - getQuizPeople: actors and directors to pick from, drawn from the films the
 *    user loved plus the best-known films in their languages.
 */
import { fetchTmdbApi } from './tmdb-server.js';
import { QUIZ_LANGUAGES } from '../../src/lib/tasteQuiz.js';

const VALID_LANGS = new Set(QUIZ_LANGUAGES.map((l) => l.id));
const MAX_LANGS = 4;

export function parseQuizLanguages(raw) {
    return [...new Set(String(raw || '').split(',').map((l) => l.trim()).filter((l) => VALID_LANGS.has(l)))]
        .slice(0, MAX_LANGS);
}

const safe = (promise) => promise.catch(() => null);

function starterCard(m) {
    return {
        id: m.id,
        title: m.title,
        year: m.release_date ? Number(String(m.release_date).slice(0, 4)) : null,
        lang: m.original_language,
        poster: m.poster_path,
        genreIds: m.genre_ids || [],
    };
}

/** Interleave lists so each language (and classic vs recent) gets a fair share. */
function interleave(lists, limit) {
    const out = [];
    const seen = new Set();
    for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i += 1) {
        lists.forEach((list) => {
            const m = list[i];
            if (!m || seen.has(m.id) || out.length >= limit) return;
            seen.add(m.id);
            out.push(m);
        });
    }
    return out;
}

/** Best-known films (all-time + recent hits) in each language. */
async function topFilmsByLanguage(lang) {
    const today = new Date().toISOString().slice(0, 10);
    const recentFrom = `${new Date().getFullYear() - 4}-01-01`;
    const [allTime, recent] = await Promise.all([
        safe(fetchTmdbApi('/discover/movie', {
            with_original_language: lang, sort_by: 'vote_count.desc', include_adult: 'false', page: '1',
        })),
        safe(fetchTmdbApi('/discover/movie', {
            with_original_language: lang, sort_by: 'popularity.desc', include_adult: 'false',
            'primary_release_date.gte': recentFrom, 'primary_release_date.lte': today, 'vote_count.gte': '30', page: '1',
        })),
    ]);
    const ok = (m) => m.poster_path && !m.adult;
    return {
        allTime: (allTime?.results || []).filter(ok),
        recent: (recent?.results || []).filter(ok),
    };
}

export async function getQuizStarters(languages, { limit = 30 } = {}) {
    if (!languages.length) return [];
    const perLang = await Promise.all(languages.map(topFilmsByLanguage));
    const lists = perLang.flatMap(({ allTime, recent }) => [allTime, recent]);
    return interleave(lists, limit).map(starterCard);
}

/**
 * Actors (top-billed) and directors from the loved films (counted double) and
 * the best-known films in the user's languages.
 */
export async function getQuizPeople(languages, lovedIds = [], { actors = 18, directors = 9 } = {}) {
    const loved = [...new Set(lovedIds.map(Number).filter((n) => n > 0))].slice(0, 8);
    const perLang = await Promise.all(languages.map(topFilmsByLanguage));
    const popular = interleave(perLang.flatMap(({ allTime, recent }) => [allTime, recent]), 16)
        .map((m) => m.id)
        .filter((id) => !loved.includes(id));
    const films = [...loved.map((id) => ({ id, weight: 2 })), ...popular.map((id) => ({ id, weight: 1 }))].slice(0, 22);

    const credits = await Promise.all(films.map((f) => safe(fetchTmdbApi(`/movie/${f.id}/credits`))
        .then((c) => ({ ...f, credits: c }))));

    const tally = (map, person, weight, film) => {
        if (!person?.id || !person.profile_path) return;
        const e = map.get(person.id) || { id: person.id, name: person.name, photo: person.profile_path, score: 0, knownFor: null };
        e.score += weight;
        if (!e.knownFor && film) e.knownFor = film;
        map.set(person.id, e);
    };
    const actorMap = new Map();
    const directorMap = new Map();
    credits.forEach(({ credits: c, weight }) => {
        if (!c) return;
        (c.cast || []).filter((p) => p.order <= 3 && p.known_for_department === 'Acting')
            .forEach((p) => tally(actorMap, p, weight, null));
        (c.crew || []).filter((p) => p.job === 'Director')
            .forEach((p) => tally(directorMap, p, weight, null));
    });
    const top = (map, n) => [...map.values()]
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, n)
        .map(({ id, name, photo }) => ({ id, name, photo }));
    return { actors: top(actorMap, actors), directors: top(directorMap, directors) };
}
