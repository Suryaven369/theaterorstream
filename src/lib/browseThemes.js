/**
 * Browse themes (Search Categories → Themes & styles).
 * Stored in app_settings under key `browse_themes`.
 * Defaults match api/_lib/theme-browse-server.js seed config.
 */

import { supabase } from './supabaseClient.js';
import { SEARCH_THEMES as DEFAULT_SEARCH_THEMES } from '../constants/searchCategories.js';

export const BROWSE_THEMES_KEY = 'browse_themes';

/** Seed / fallback list when nothing is saved in admin yet. */
export function getDefaultBrowseThemes() {
    return DEFAULT_SEARCH_THEMES.map((t, index) => ({
        id: t.id,
        label: t.label,
        keywordIds: [...(t.keywordIds || [])],
        keywordQueries: [...(t.keywordQueries || [])],
        genreIds: [...(t.genreIds || [])],
        originalLanguage: t.originalLanguage || null,
        enabled: true,
        sortOrder: index,
    }));
}

export function normalizeTheme(raw, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    if (!id) return null;
    return {
        id,
        label: String(raw.label || id).trim() || id,
        keywordIds: Array.isArray(raw.keywordIds)
            ? raw.keywordIds.map(Number).filter((n) => n > 0)
            : [],
        keywordQueries: Array.isArray(raw.keywordQueries)
            ? raw.keywordQueries.map((q) => String(q).trim()).filter(Boolean)
            : [],
        genreIds: Array.isArray(raw.genreIds)
            ? raw.genreIds.map(Number).filter((n) => n > 0)
            : [],
        originalLanguage: raw.originalLanguage
            ? String(raw.originalLanguage).trim().slice(0, 8)
            : null,
        enabled: raw.enabled !== false,
        sortOrder: Number.isFinite(Number(raw.sortOrder))
            ? Number(raw.sortOrder)
            : index,
    };
}

export function normalizeThemesList(list) {
    if (!Array.isArray(list)) return getDefaultBrowseThemes();
    const seen = new Set();
    const out = [];
    list.forEach((raw, index) => {
        const theme = normalizeTheme(raw, index);
        if (!theme || seen.has(theme.id)) return;
        seen.add(theme.id);
        out.push(theme);
    });
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Active themes for public Search chips (enabled only). */
export function toPublicThemeChips(themes) {
    return normalizeThemesList(themes)
        .filter((t) => t.enabled)
        .map((theme) => {
            // Overlay curated keyword IDs from SEARCH_THEMES (fixes stale DB values)
            const curated = DEFAULT_SEARCH_THEMES.find((c) => c.id === theme.id);
            const keywordIds = curated?.keywordIds?.length
                ? [...curated.keywordIds]
                : theme.keywordIds;
            const keywordQueries = curated?.keywordQueries?.length
                ? [...curated.keywordQueries]
                : theme.keywordQueries;
            const genreIds = curated?.genreIds?.length
                ? [...curated.genreIds]
                : theme.genreIds;
            const originalLanguage = curated?.originalLanguage || theme.originalLanguage;
            return {
                id: theme.id,
                label: theme.label,
                keywordIds,
                keywordQueries,
                ...(genreIds?.length ? { genreIds } : {}),
                ...(originalLanguage ? { originalLanguage } : {}),
            };
        });
}

/** Admin: load from app_settings (falls back to defaults). */
export async function loadBrowseThemes() {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', BROWSE_THEMES_KEY)
            .maybeSingle();

        if (error) {
            console.error('[browseThemes] load failed:', error.message);
            return { themes: getDefaultBrowseThemes(), fromDefaults: true };
        }

        const saved = data?.value?.themes;
        if (!Array.isArray(saved) || !saved.length) {
            return { themes: getDefaultBrowseThemes(), fromDefaults: true };
        }

        return { themes: normalizeThemesList(saved), fromDefaults: false };
    } catch (err) {
        console.error('[browseThemes] load error:', err);
        return { themes: getDefaultBrowseThemes(), fromDefaults: true };
    }
}

/** Admin: persist full themes list. */
export async function saveBrowseThemes(themes) {
    const normalized = normalizeThemesList(themes);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
        .from('app_settings')
        .upsert(
            {
                key: BROWSE_THEMES_KEY,
                value: {
                    themes: normalized,
                    updatedAt: new Date().toISOString(),
                },
                updated_by: user?.id || null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'key' },
        );

    if (error) {
        console.error('[browseThemes] save failed:', error.message);
        return { success: false, error };
    }

    return { success: true, themes: normalized };
}

/**
 * Public: fetch themes from edge API (service-role read), else defaults.
 */
export async function fetchPublicBrowseThemes() {
    try {
        const res = await fetch('/api/content/browse-themes', {
            headers: { Accept: 'application/json' },
        });
        if (res.ok) {
            const payload = await res.json();
            if (Array.isArray(payload?.themes) && payload.themes.length) {
                return toPublicThemeChips(payload.themes);
            }
        }
    } catch {
        // fall through
    }
    return toPublicThemeChips(getDefaultBrowseThemes());
}
