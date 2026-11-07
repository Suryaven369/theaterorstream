const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const MOOD_WORDS = {
    mind_bending: 'mind-bending', feel_good: 'feel-good', action_packed: 'action-packed',
    family_friendly: 'family-friendly', suspenseful: 'suspenseful', dark: 'dark', intense: 'intense',
    funny: 'funny', emotional: 'emotional', romantic: 'romantic', thoughtful: 'thoughtful', cozy: 'cozy',
};

function listJoin(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

export function generateTasteSummary(tasteProfile, displayProfile) {
    if (!tasteProfile && !displayProfile) return null;

    // The rebuild writes a proper sentence (AI or template) — prefer it.
    if (tasteProfile?.taste_summary) return tasteProfile.taste_summary;

    const topGenres = Object.entries(tasteProfile?.genre_weights || {})
        .filter(([, w]) => Number(w) > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => GENRE_NAMES[id])
        .filter(Boolean);
    const moods = Object.entries(tasteProfile?.mood_preferences || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m]) => MOOD_WORDS[m] || m.replace(/_/g, ' '));
    const decades = (tasteProfile?.preferred_decades || []).slice(0, 2).map((d) => `${d}s`);

    if (!topGenres.length) {
        const fav = displayProfile?.favorite_genres || [];
        if (fav.length) return `Into ${listJoin(fav.slice(0, 3))} cinema.`;
        // No real taste signal yet — callers decide whether to show a CTA
        // (own profile) or hide the card (viewing someone else as a guest).
        return null;
    }

    let text = `Loves ${listJoin(topGenres)}`;
    if (moods.length) text += ` with ${listJoin(moods)} vibes`;
    if (decades.length) text += `, mostly from the ${listJoin(decades)}`;
    return `${text}.`;
}
