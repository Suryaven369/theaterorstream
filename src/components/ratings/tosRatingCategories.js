export const TOS_RATING_CATEGORIES = [
    { key: 'acting', label: 'Acting', color: '#22c55e' },
    { key: 'screenplay', label: 'Screenplay', color: '#3b82f6' },
    { key: 'sound', label: 'Sound', color: '#a855f7' },
    { key: 'direction', label: 'Direction', color: '#f97316' },
    { key: 'entertainment', label: 'Entertainment', color: '#ec4899' },
    { key: 'pacing', label: 'Pacing', color: '#06b6d4' },
    { key: 'cinematography', label: 'Cinematography', color: '#f59e0b' },
];

export const DEFAULT_TOS_RATINGS = {
    acting: 5,
    screenplay: 5,
    sound: 5,
    direction: 5,
    entertainment: 5,
    pacing: 5,
    cinematography: 5,
};

export function tosRatingsFromRow(row) {
    if (!row) return { ...DEFAULT_TOS_RATINGS };
    return {
        acting: row.acting ?? 5,
        screenplay: row.screenplay ?? 5,
        sound: row.sound ?? 5,
        direction: row.direction ?? 5,
        entertainment: row.entertainment ?? 5,
        pacing: row.pacing ?? 5,
        cinematography: row.cinematography ?? 5,
    };
}
