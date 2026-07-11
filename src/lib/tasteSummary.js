const GENRE_NAMES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export function generateTasteSummary(tasteProfile, displayProfile) {
    if (!tasteProfile && !displayProfile) return null;

    const weights = tasteProfile?.genre_weights || {};
    const topGenres = Object.entries(weights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => GENRE_NAMES[id] || `Genre ${id}`);

    const moods = Object.keys(tasteProfile?.mood_preferences || {}).slice(0, 2);
    const decades = (tasteProfile?.preferred_decades || []).slice(0, 2);
    const pacing = tasteProfile?.onboarding_step_data?.pacing || tasteProfile?.axis_preferences?.pacing;

    const parts = [];
    if (topGenres.length) parts.push(`Loves ${topGenres.join(', ')}`);
    if (moods.length) parts.push(`with ${moods.join(' & ')} vibes`);
    if (pacing) parts.push(`Prefers ${String(pacing).replace(/_/g, ' ')} pacing`);
    if (decades.length) parts.push(`from the ${decades.join(' & ')}s`);

    if (!parts.length) {
        const fav = displayProfile?.favorite_genres || [];
        if (fav.length) return `Into ${fav.slice(0, 3).join(', ')} cinema.`;
        // No real taste signal yet — callers decide whether to show a CTA
        // (own profile) or hide the card (viewing someone else as a guest).
        return null;
    }

    return `${parts.join('. ')}.`;
}
