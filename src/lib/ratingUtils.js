export const RATING_CATEGORIES = [
    'acting',
    'screenplay',
    'sound',
    'direction',
    'entertainment',
    'pacing',
    'cinematography',
];

export const TOS_RATING_CATEGORY_DEFS = [
    { key: 'acting', label: 'Acting', color: '#22c55e' },
    { key: 'screenplay', label: 'Screenplay', color: '#3b82f6' },
    { key: 'sound', label: 'Sound', color: '#a855f7' },
    { key: 'direction', label: 'Direction', color: '#f97316' },
    { key: 'entertainment', label: 'Entertainment', color: '#ec4899' },
    { key: 'pacing', label: 'Pacing', color: '#06b6d4' },
    { key: 'cinematography', label: 'Cinematography', color: '#f59e0b' },
];

export const defaultTosRatings = () => ({
    acting: 5,
    screenplay: 5,
    sound: 5,
    direction: 5,
    entertainment: 5,
    pacing: 5,
    cinematography: 5,
});

export const ratingsFromExisting = (existing) => {
    const next = defaultTosRatings();
    if (!existing) return next;
    RATING_CATEGORIES.forEach((key) => {
        const value = existing[key];
        if (value != null && !Number.isNaN(Number(value))) {
            next[key] = Number(value);
        }
    });
    return next;
};

export const computeOverallFromCategories = (ratings) => {
    if (!ratings) return null;

    const values = RATING_CATEGORIES
        .map((cat) => ratings[cat])
        .filter((value) => value != null);

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const computeOverallFromRatingRow = (row) => computeOverallFromCategories(row);

export const computeTosScoreFromAggregates = (aggregates) => {
    if (!aggregates) return null;

    let totalSum = 0;
    let totalCount = 0;

    RATING_CATEGORIES.forEach((cat) => {
        if (aggregates[cat] != null) {
            totalSum += aggregates[cat];
            totalCount += 1;
        }
    });

    if (totalCount === 0) return null;
    return totalSum / totalCount;
};
