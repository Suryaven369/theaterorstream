const RATING_CATEGORIES = [
    'acting',
    'screenplay',
    'sound',
    'direction',
    'entertainment',
    'pacing',
    'cinematography',
];

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
