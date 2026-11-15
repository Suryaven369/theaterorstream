/**
 * Warm, specific encouragement shown between onboarding questions.
 * Built from the user's own answers; deliberately no statistics.
 */
import { QUIZ_LANGUAGES, QUIZ_GENRES, QUIZ_MOODS } from './tasteQuiz';

const langName = (id) => QUIZ_LANGUAGES.find((l) => l.id === id)?.label || id;
const genreName = (id) => QUIZ_GENRES.find((g) => g.id === Number(id))?.label || null;

function joinNames(names) {
    const list = names.filter(Boolean);
    if (list.length <= 1) return list[0] || '';
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// What a dominant genre says about someone (TMDB genre id → line).
const GENRE_LINES = {
    28: 'You like your cinema big, bold and full of swagger. The best kind.',
    12: 'You love a grand adventure. Nothing beats that feeling.',
    18: 'You go for stories with real heart. That’s a special kind of taste.',
    35: 'You know a good laugh beats almost anything. Great call.',
    53: 'You love being kept on the edge of your seat. Sharp taste.',
    80: 'Gritty, clever and gripping. You clearly know a great story.',
    9648: 'You love a twist you didn’t see coming. Respect.',
    10749: 'A true romantic at heart. We’ve got beautiful picks lined up.',
    27: 'Not easily scared, are you? We like that.',
    878: 'You love worlds bigger than our own. Visionary taste.',
    14: 'Epic worlds and big imagination. You have great taste.',
    10751: 'Movies the whole family can love. Heartwarming choices.',
    16: 'Animation fans know where the real magic is.',
    99: 'Curious mind. Real stories hit different.',
};

/** Most common genre across the picked films. */
function dominantGenre(movies) {
    const counts = new Map();
    movies.forEach((m) => (m.genreIds || []).forEach((g) => counts.set(g, (counts.get(g) || 0) + 1)));
    let best = null;
    counts.forEach((n, g) => { if (GENRE_LINES[g] && (!best || n > best.n)) best = { g, n }; });
    return best?.g ?? null;
}

/** After picking loved films. */
export function lovedCheer({ loved = [], languages = [] }) {
    const titles = loved.slice(0, 2).map((m) => m.title);
    const genre = dominantGenre(loved);
    const title = titles.length >= 2
        ? `${titles[0]} and ${titles[1]}? Excellent picks.`
        : titles.length ? `${titles[0]}? Excellent pick.` : 'Excellent picks.';
    const lines = [GENRE_LINES[genre] || 'You clearly know what you like, and that makes our job easy.'];
    const langs = languages.filter((l) => l !== 'en');
    if (languages.length >= 2) {
        lines.push(`${joinNames(languages.map(langName))} cinema. You get the best of every world.`);
    } else if (langs.length === 1) {
        lines.push(`${langName(langs[0])} cinema has some of the best stories out there. Great choice.`);
    }
    return { emoji: '🍿', title, lines };
}

/** After genres + favourite people. */
export function peopleCheer({ actors = [], directors = [], genres = [] }) {
    const stars = actors.slice(0, 2).map((p) => p.name);
    const director = directors[0]?.name;
    let title = 'Iconic choices.';
    if (stars.length >= 2) title = `${stars[0]} and ${stars[1]}? Iconic.`;
    else if (stars.length === 1) title = `A ${stars[0]} fan! Great taste.`;
    else if (director) title = `A ${director} fan! Great taste.`;
    const lines = [];
    if (director && stars.length) lines.push(`And ${director}. You really appreciate great storytelling.`);
    const names = genres.slice(0, 2).map(genreName).filter(Boolean);
    if (names.length === 2) lines.push(`${names[0]} and ${names[1].toLowerCase()} make a brilliant combination.`);
    else if (names.length === 1) lines.push(`${names[0]} lovers always have the best watchlists.`);
    lines.push('Just a few more quick ones. Your picks are getting sharper with every answer.');
    return { emoji: '🌟', title, lines };
}

/** Before the last (practical) questions. */
export function almostCheer({ moods = [], company = [] }) {
    const mood = QUIZ_MOODS.find((m) => m.id === moods[0])?.label;
    const lines = [];
    if (mood && company.includes('family')) lines.push(`${mood} movie nights with family. The best kind of evening.`);
    else if (mood && company.includes('partner')) lines.push(`${mood} picks for two. We’ve got you covered.`);
    else if (mood && company.includes('friends')) lines.push(`${mood} movies with friends. Those are the nights people remember.`);
    else if (mood) lines.push(`${mood} it is. We know exactly what to find for you.`);
    lines.push('Last two questions, then we’ll show you movies picked just for you.');
    return { emoji: '🎬', title: 'Almost there. You’re doing great!', lines };
}
