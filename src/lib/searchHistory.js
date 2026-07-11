const STORAGE_KEY = 'tos_recent_searches';
const MAX_ITEMS = 12;

export function getRecentSearches() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.trim()) : [];
    } catch {
        return [];
    }
}

export function addRecentSearch(query) {
    const q = (query || '').trim();
    if (q.length < 2) return getRecentSearches();

    const prev = getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase());
    const next = [q, ...prev].slice(0, MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function removeRecentSearch(query) {
    const next = getRecentSearches().filter((s) => s !== query);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function clearRecentSearches() {
    localStorage.removeItem(STORAGE_KEY);
    return [];
}
