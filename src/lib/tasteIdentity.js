/** Generate taste identity title + summary from onboarding answers */

const IDENTITY_RULES = [
    {
        match: (s) => s.emotionalTastes?.includes('philosophical') || s.complexityPref === 'mind_bending',
        title: 'The Mind Architect',
        tagline: 'You chase ideas that rearrange how you see the world.',
    },
    {
        match: (s) => s.emotionalTastes?.includes('dark') || s.worldPrefs?.includes('dystopian'),
        title: 'The Noir Voyager',
        tagline: 'Drawn to shadow, tension, and stories with teeth.',
    },
    {
        match: (s) => s.emotionalTastes?.includes('hopeful') || s.endingPrefs?.includes('happy'),
        title: 'The Hope Seeker',
        tagline: 'You believe cinema should lift the soul.',
    },
    {
        match: (s) => s.storytellingPrefs?.includes('sci_fi') || s.worldPrefs?.includes('futuristic'),
        title: 'The Future Gazer',
        tagline: 'Tomorrow, technology, and cosmic wonder call to you.',
    },
    {
        match: (s) => s.storytellingPrefs?.includes('fantasy') || s.worldPrefs?.includes('fantasy_world'),
        title: 'The Realm Dreamer',
        tagline: 'Epic worlds and impossible adventures feel like home.',
    },
    {
        match: (s) => s.characterPrefs?.includes('antihero') || s.emotionalTastes?.includes('intense'),
        title: 'The Edge Rider',
        tagline: 'Flawed heroes and high-stakes drama keep you hooked.',
    },
    {
        match: (s) => s.pacingPref === 'slow_burn' || s.emotionalGoals?.includes('thought_provoking'),
        title: 'The Patient Curator',
        tagline: 'Slow burns and layered storytelling are your sweet spot.',
    },
    {
        match: (s) => s.pacingPref === 'fast_chaotic' || s.emotionalGoals?.includes('adrenaline'),
        title: 'The Adrenaline Architect',
        tagline: 'Fast, fierce, and unforgettable — that is your cinema.',
    },
    {
        match: (s) => s.emotionalGoals?.includes('comfort') || s.moodIds?.includes('cozy'),
        title: 'The Comfort Connoisseur',
        tagline: 'Films that feel like a warm blanket on a rainy night.',
    },
    {
        match: (s) => s.cinematographyPrefs?.includes('dreamlike') || s.storytellingPrefs?.includes('surreal'),
        title: 'The Aesthetic Poet',
        tagline: 'Beauty, mood, and visual poetry matter as much as plot.',
    },
];

export function generateTasteIdentity(state) {
    const rule = IDENTITY_RULES.find((r) => r.match(state));
    const title = rule?.title || 'The Cinematic Explorer';
    const tagline = rule?.tagline || 'Your taste is eclectic, bold, and uniquely yours.';

    const highlights = [];
    if (state.genreIds?.length) highlights.push(`${state.genreIds.length} genre signals`);
    if (state.favoriteMovieIds?.length) highlights.push(`${state.favoriteMovieIds.length} beloved titles`);
    if (state.swipeRatings && Object.keys(state.swipeRatings).length) {
        highlights.push(`${Object.keys(state.swipeRatings).length} swipe reactions`);
    }
    if (state.streamingServices?.length) {
        highlights.push(`${state.streamingServices.length} streaming platforms`);
    }

    const summary = [
        tagline,
        highlights.length ? `Calibrated from ${highlights.join(', ')}.` : '',
    ].filter(Boolean).join(' ');

    return { title, tagline, summary };
}

export function buildRecommendationReason(state, movie) {
    const genreName = movie?.genres?.[0]?.name || movie?.genre;
    const parts = [];

    if (state.storytellingPrefs?.includes('sci_fi') && genreName?.toLowerCase().includes('sci')) {
        parts.push('Because you love sci-fi storytelling');
    } else if (state.emotionalTastes?.includes('emotional')) {
        parts.push('Because you enjoy emotional, character-driven films');
    } else if (state.genreIds?.length) {
        parts.push('Because it matches your genre taste profile');
    } else {
        parts.push('Because it aligns with your onboarding picks');
    }

    if (state.pacingPref === 'slow_burn') parts.push('with the slow-burn pacing you prefer');
    if (state.streamingServices?.length) parts.push('and may be available on your platforms');

    return `${parts.join(' ')}.`;
}

export function pickFirstRecommendation(candidates, state) {
    if (!candidates?.length) return null;

    const favoriteSet = new Set((state.favoriteMovieIds || []).map(String));
    const loved = candidates.find((m) => {
        const id = String(m.tmdb_id || m.id);
        return favoriteSet.has(id);
    });
    if (loved) return loved;

    return candidates[0];
}
