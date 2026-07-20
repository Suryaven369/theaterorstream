import { DNA_TRAIT_LABELS, SPECTRUM_DEFS } from '../constants/tasteMap';
import { TASTE_MOODS } from '../constants/discoveryTaste';

const MOOD_LABEL = Object.fromEntries(TASTE_MOODS.map((m) => [m.id, m.label]));

export function posterUrl(path, size = 'w154') {
    if (!path) return null;
    if (String(path).startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function confidenceTier(signalCount) {
    const n = Number(signalCount) || 0;
    if (n >= 8) return { id: 'high', label: 'High confidence' };
    if (n >= 3) return { id: 'medium', label: 'Medium confidence' };
    if (n >= 1) return { id: 'low', label: 'Low confidence' };
    return { id: 'none', label: 'Still learning' };
}

/** Status + soft completion % from rating volume (never implies perfect knowledge). */
export function tasteStatusFromCount(ratingCount = 0, likedCount = 0, eventCount = 0) {
    const ratings = Number(ratingCount) || 0;
    let status = 'Learning your taste';
    if (ratings >= 40) status = 'Highly personalised';
    else if (ratings >= 15) status = 'Strong taste profile';
    else if (ratings >= 5) status = 'Taste map developing';

    const raw = Math.min(
        92,
        Math.round(ratings * 1.8 + Math.min(likedCount, 20) * 0.8 + Math.min(eventCount, 40) * 0.25),
    );
    const confidence = ratings === 0 && likedCount === 0 ? 0 : Math.max(8, raw);

    return { status, confidence };
}

export function deriveCinematicIdentity({ genres = [], moods = [], dna = [], tasteSummary }) {
    const topGenre = genres[0]?.name || '';
    const topMood = moods[0] ? (MOOD_LABEL[moods[0].id] || moods[0].id) : '';
    const topDna = dna[0]?.id || '';
    const dnaLabel = DNA_TRAIT_LABELS[topDna] || '';

    let label = 'The Balanced Moviegoer';
    if (topDna === 'atmospheric' || topDna === 'slow_burn') label = 'The Atmospheric Explorer';
    else if (topDna === 'emotional' || topDna === 'tearjerker') label = 'The Emotional Story Seeker';
    else if (topDna === 'mind_bending' || topDna === 'thought_provoking' || topDna === 'philosophical') {
        label = 'The High-Concept Thinker';
    } else if (topDna === 'feel_good' || topDna === 'funny') label = 'The Comfort Watcher';
    else if (topDna === 'action_heavy' || topDna === 'fast_paced' || topDna === 'intense') {
        label = 'The Adrenaline Hunter';
    } else if (topDna === 'character_driven' || topDna === 'dialogue_heavy') {
        label = 'The Character-First Viewer';
    } else if (topDna === 'epic') label = 'The Cinematic Spectacle Lover';
    else if (topDna === 'dark' || topDna === 'psychological') label = 'The Dark Story Enthusiast';
    else if (topDna === 'mystery_driven' || topDna === 'plot_twist') label = 'The Unpredictability Seeker';
    else if (String(topGenre).toLowerCase().includes('comedy') || topMood.toLowerCase().includes('feel')) {
        label = 'The Feel-Good Loyalist';
    } else if (genres.length >= 3) label = 'The Curious World Traveller';

    const parts = [];
    if (topGenre) parts.push(`strong pull toward ${topGenre}`);
    if (dnaLabel) parts.push(`${dnaLabel.toLowerCase()} storytelling`);
    if (topMood) parts.push(`${topMood.toLowerCase()} moods`);

    const description = tasteSummary
        || (parts.length
            ? `You gravitate towards ${parts.join(', ')}. This summary evolves as you rate, like, and watch more.`
            : 'Rate and engage with a few more films and we’ll sketch a clearer cinematic identity.');

    return { label, description };
}

function avgTraitScore(dnaMap, keys) {
    const vals = keys.map((k) => Number(dnaMap[k])).filter((n) => Number.isFinite(n) && n > 0);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Map DNA preferences onto 0–100 spectrum positions. */
export function buildSpectraFromDna(favoriteDna = []) {
    const dnaMap = Object.fromEntries(
        (favoriteDna || []).map((d) => [d.id, d.score]),
    );
    return SPECTRUM_DEFS.map((def) => {
        const low = avgTraitScore(dnaMap, def.lowTraits);
        const high = avgTraitScore(dnaMap, def.highTraits);
        let position = 50;
        let evidence = 0;
        if (low != null || high != null) {
            const l = low ?? 0;
            const h = high ?? 0;
            evidence = (low != null ? 1 : 0) + (high != null ? 1 : 0);
            if (l + h > 0) position = Math.round((h / (l + h)) * 100);
            else position = 50;
        }
        const conf = confidenceTier(
            evidence + Math.round(((low || 0) + (high || 0)) / 40),
        );
        return {
            ...def,
            position,
            confidence: conf,
            evidenceCount: evidence,
            hasSignal: low != null || high != null,
        };
    });
}

export function rankAxisPreferences(axisPreferences = {}) {
    return Object.entries(axisPreferences || {})
        .map(([key, value]) => ({ key, score: Number(value) }))
        .filter((r) => Number.isFinite(r.score))
        .sort((a, b) => b.score - a.score);
}

export function buildRecentInsights(dashboard) {
    const insights = [];
    const evo = dashboard?.evolution;
    if (evo?.genres?.length || evo?.dna?.length) {
        [...(evo.genres || []), ...(evo.dna || [])]
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 5)
            .forEach((m) => {
                const up = m.delta > 0;
                insights.push({
                    id: `evo-${m.key}`,
                    title: up
                        ? `${m.name} appears to be rising in your taste`
                        : `${m.name} may be cooling off`,
                    description: up
                        ? `We are noticing more positive engagement with ${m.name} over the last ${evo.sinceDays || 21} days.`
                        : `Recent activity suggests less pull toward ${m.name} compared with a few weeks ago.`,
                    confidence: Math.abs(m.delta) >= 8 ? 'Medium confidence' : 'Low confidence',
                    date: evo.capturedAt || null,
                });
            });
    }
    (dashboard?.evolvingInterests || []).slice(0, 3).forEach((g) => {
        insights.push({
            id: `rise-${g.id}`,
            title: `Growing interest in ${g.name}`,
            description: 'Your recent likes and ratings point toward this genre more often than before.',
            confidence: 'Emerging interest',
            date: null,
        });
    });
    return insights.slice(0, 6);
}

export function defaultViewingModeSummaries({ genres = [], moods = [], dna = [] }) {
    const g = genres.slice(0, 2).map((x) => x.name).join(' & ') || 'varied genres';
    const vibe = dna[0] ? (DNA_TRAIT_LABELS[dna[0].id] || dna[0].id) : (moods[0] ? MOOD_LABEL[moods[0].id] : 'atmospheric');
    return {
        solo: `Often ${String(vibe).toLowerCase()} stories with space to focus — especially ${g}.`,
        partner: `Shared picks that stay accessible while still matching your taste for ${g}.`,
        friends: 'Faster, crowd-friendly energy with humour, action, or clear hooks.',
        family: 'Warmer, more accessible stories with lighter content boundaries.',
        theatre: 'Large-scale visuals, immersive sound, and event-level excitement.',
        home: 'Character-driven or comfort watches that reward patience on a smaller screen.',
    };
}
