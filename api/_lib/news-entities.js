/**
 * News Entity Extraction and Normalization Service
 * 
 * Takes entities from AI classification and:
 * - Matches movies/TV shows to movies_library records by TMDB ID
 * - Normalizes person names (actors, directors, etc.)
 * - Normalizes studio/streamer names to canonical forms
 * - Enriches entities with metadata for linking
 */

import { getSupabaseAdmin } from './supabase-admin.js';
import { fetchTmdbApi } from './tmdb-server.js';

// Canonical studio name mappings (common variations → standard name)
const STUDIO_ALIASES = {
    // Major Studios
    'disney': 'Walt Disney Studios',
    'walt disney': 'Walt Disney Studios',
    'disney+': 'Disney+',
    'disney plus': 'Disney+',
    'warner bros': 'Warner Bros.',
    'warner brothers': 'Warner Bros.',
    'wb': 'Warner Bros.',
    'warner': 'Warner Bros.',
    'universal': 'Universal Pictures',
    'universal studios': 'Universal Pictures',
    'paramount': 'Paramount Pictures',
    'paramount+': 'Paramount+',
    'paramount plus': 'Paramount+',
    'sony': 'Sony Pictures',
    'sony pictures': 'Sony Pictures',
    'columbia': 'Columbia Pictures',
    'columbia pictures': 'Columbia Pictures',
    'fox': '20th Century Studios',
    '20th century fox': '20th Century Studios',
    'twentieth century fox': '20th Century Studios',
    '20th century': '20th Century Studios',
    'lionsgate': 'Lionsgate',
    'lions gate': 'Lionsgate',
    'mgm': 'MGM',
    'metro goldwyn mayer': 'MGM',
    
    // Marvel/DC
    'marvel': 'Marvel Studios',
    'marvel studios': 'Marvel Studios',
    'mcu': 'Marvel Studios',
    'dc': 'DC Studios',
    'dc studios': 'DC Studios',
    'dc films': 'DC Studios',
    'dceu': 'DC Studios',
    
    // Streamers
    'netflix': 'Netflix',
    'amazon': 'Amazon Studios',
    'amazon studios': 'Amazon Studios',
    'amazon prime': 'Amazon Prime Video',
    'prime video': 'Amazon Prime Video',
    'hbo': 'HBO',
    'hbo max': 'Max',
    'max': 'Max',
    'apple': 'Apple TV+',
    'apple tv': 'Apple TV+',
    'apple tv+': 'Apple TV+',
    'hulu': 'Hulu',
    'peacock': 'Peacock',
    
    // Other studios
    'a24': 'A24',
    'blumhouse': 'Blumhouse Productions',
    'pixar': 'Pixar',
    'dreamworks': 'DreamWorks',
    'illumination': 'Illumination',
    'lucasfilm': 'Lucasfilm',
    'searchlight': 'Searchlight Pictures',
    'focus': 'Focus Features',
    'focus features': 'Focus Features',
    'neon': 'Neon',
    'annapurna': 'Annapurna Pictures',
};

// Franchise name mappings
const FRANCHISE_ALIASES = {
    'mcu': 'Marvel Cinematic Universe',
    'marvel cinematic universe': 'Marvel Cinematic Universe',
    'dceu': 'DC Extended Universe',
    'dc extended universe': 'DC Extended Universe',
    'dcu': 'DC Universe',
    'star wars': 'Star Wars',
    'starwars': 'Star Wars',
    'harry potter': 'Harry Potter',
    'wizarding world': 'Wizarding World',
    'fast and furious': 'Fast & Furious',
    'fast & furious': 'Fast & Furious',
    'f&f': 'Fast & Furious',
    'mission impossible': 'Mission: Impossible',
    'mi': 'Mission: Impossible',
    'james bond': 'James Bond',
    '007': 'James Bond',
    'jurassic': 'Jurassic World',
    'jurassic park': 'Jurassic World',
    'jurassic world': 'Jurassic World',
    'transformers': 'Transformers',
    'avatar': 'Avatar',
    'lord of the rings': 'The Lord of the Rings',
    'lotr': 'The Lord of the Rings',
    'middle-earth': 'Middle-earth',
    'spider-man': 'Spider-Man',
    'spiderman': 'Spider-Man',
    'batman': 'Batman',
    'superman': 'Superman',
    'x-men': 'X-Men',
    'xmen': 'X-Men',
    'alien': 'Alien',
    'predator': 'Predator',
    'terminator': 'Terminator',
    'indiana jones': 'Indiana Jones',
    'indy': 'Indiana Jones',
    'planet of the apes': 'Planet of the Apes',
    'godzilla': 'Godzilla',
    'monsterverse': 'MonsterVerse',
    'kong': 'MonsterVerse',
    'john wick': 'John Wick',
};

/**
 * Normalize a studio/streamer name to canonical form
 */
export function normalizeStudioName(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return STUDIO_ALIASES[lower] || name.trim();
}

/**
 * Normalize a franchise name
 */
export function normalizeFranchiseName(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return FRANCHISE_ALIASES[lower] || name.trim();
}

/**
 * Normalize a person's name (basic cleanup)
 */
export function normalizePersonName(name) {
    if (!name) return null;
    return name
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Search movies_library for a title match
 */
async function searchLibraryForTitle(title, year = null, mediaType = null) {
    if (!title) return null;

    const supabase = getSupabaseAdmin();
    const normalizedTitle = title.toLowerCase().trim();

    // Build search query
    let query = supabase
        .from('movies_library')
        .select('tmdb_id, title, original_title, media_type, release_date, first_air_date, poster_path, vote_average')
        .eq('is_active', true);

    if (mediaType) {
        query = query.eq('media_type', mediaType);
    }

    // Try exact title match first
    query = query.or(`title.ilike.${normalizedTitle},original_title.ilike.${normalizedTitle}`);

    const { data, error } = await query.limit(10);

    if (error || !data?.length) {
        return null;
    }

    // Score and rank matches
    const scored = data.map(item => {
        let score = 0;
        const itemTitle = (item.title || '').toLowerCase();
        const itemOriginal = (item.original_title || '').toLowerCase();

        // Exact match
        if (itemTitle === normalizedTitle || itemOriginal === normalizedTitle) {
            score += 100;
        }
        // Contains match
        else if (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)) {
            score += 50;
        }

        // Year match bonus
        if (year) {
            const itemYear = (item.release_date || item.first_air_date || '').slice(0, 4);
            if (itemYear === String(year)) {
                score += 30;
            } else if (Math.abs(parseInt(itemYear) - parseInt(year)) <= 1) {
                score += 15;
            }
        }

        // Popularity bonus (higher vote_average = more likely correct)
        score += (item.vote_average || 0) * 2;

        return { ...item, matchScore: score };
    });

    // Sort by score and return best match
    scored.sort((a, b) => b.matchScore - a.matchScore);
    
    if (scored[0]?.matchScore > 30) {
        return scored[0];
    }

    return null;
}

/**
 * Search TMDB directly for a title (fallback when not in library)
 */
async function searchTmdbForTitle(title, year = null, mediaType = null) {
    if (!title) return null;

    try {
        const params = {
            query: title,
            include_adult: 'false',
            page: '1',
        };
        if (year) params.year = String(year);

        const endpoint = mediaType === 'tv' ? '/search/tv' : '/search/multi';
        const data = await fetchTmdbApi(endpoint, params);

        if (!data?.results?.length) return null;

        // Find best match
        const match = data.results.find(r => 
            (r.media_type === 'movie' || r.media_type === 'tv') &&
            (r.title || r.name)
        );

        if (match) {
            return {
                tmdb_id: String(match.id),
                title: match.title || match.name,
                media_type: match.media_type,
                release_date: match.release_date || match.first_air_date,
                poster_path: match.poster_path,
                vote_average: match.vote_average,
                from_tmdb_search: true,
            };
        }
    } catch (err) {
        console.warn('[news-entities] TMDB search failed:', err.message);
    }

    return null;
}

/**
 * Enrich movie/TV entities with TMDB data
 */
async function enrichMovieEntities(entities) {
    if (!entities?.length) return [];

    const enriched = [];

    for (const entity of entities) {
        const title = entity.title || entity.name || entity;
        const year = entity.year || null;
        const mediaType = entity.media_type || null;

        // Try library first
        let match = await searchLibraryForTitle(title, year, mediaType);

        // Fallback to TMDB search
        if (!match) {
            match = await searchTmdbForTitle(title, year, mediaType);
        }

        if (match) {
            enriched.push({
                title: match.title,
                original_title: title, // Keep original for reference
                tmdb_id: match.tmdb_id,
                media_type: match.media_type,
                year: (match.release_date || match.first_air_date || '').slice(0, 4) || year,
                poster_path: match.poster_path,
                vote_average: match.vote_average,
                matched: true,
                in_library: !match.from_tmdb_search,
            });
        } else {
            enriched.push({
                title: title,
                year: year,
                matched: false,
                in_library: false,
            });
        }
    }

    return enriched;
}

/**
 * Enrich person entities (basic normalization, could add TMDB person lookup later)
 */
function enrichPersonEntities(entities) {
    if (!entities?.length) return [];

    return entities.map(entity => {
        const name = entity.name || entity;
        const role = entity.role || 'unknown';

        return {
            name: normalizePersonName(name),
            original_name: name,
            role: role.toLowerCase(),
        };
    });
}

/**
 * Enrich studio entities
 */
function enrichStudioEntities(entities) {
    if (!entities?.length) return [];

    return [...new Set(entities.map(e => {
        const name = typeof e === 'string' ? e : e.name;
        return normalizeStudioName(name);
    }).filter(Boolean))];
}

/**
 * Enrich franchise entities
 */
function enrichFranchiseEntities(entities) {
    if (!entities?.length) return [];

    return [...new Set(entities.map(e => {
        const name = typeof e === 'string' ? e : e.name;
        return normalizeFranchiseName(name);
    }).filter(Boolean))];
}

/**
 * Main entity normalization function
 * Takes raw entities from AI classification and returns enriched version
 */
export async function normalizeEntities(rawEntities) {
    if (!rawEntities || typeof rawEntities !== 'object') {
        return {};
    }

    const normalized = {};

    // Process movies
    if (rawEntities.movies?.length) {
        normalized.movies = await enrichMovieEntities(rawEntities.movies);
    }

    // Process TV series
    if (rawEntities.series?.length) {
        const seriesWithType = rawEntities.series.map(s => ({
            ...s,
            media_type: 'tv',
        }));
        normalized.series = await enrichMovieEntities(seriesWithType);
    }

    // Process people
    if (rawEntities.people?.length) {
        normalized.people = enrichPersonEntities(rawEntities.people);
    }

    // Process studios
    if (rawEntities.studios?.length) {
        normalized.studios = enrichStudioEntities(rawEntities.studios);
    }

    // Process streamers
    if (rawEntities.streamers?.length) {
        normalized.streamers = enrichStudioEntities(rawEntities.streamers);
    }

    // Process franchises
    if (rawEntities.franchises?.length) {
        normalized.franchises = enrichFranchiseEntities(rawEntities.franchises);
    }

    // Pass through awards unchanged
    if (rawEntities.awards?.length) {
        normalized.awards = rawEntities.awards;
    }

    return normalized;
}

/**
 * Process and update an article's entities
 */
export async function normalizeAndUpdateArticleEntities(articleId) {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();

    // Fetch article with current entities
    const { data: article, error: fetchErr } = await supabase
        .from('feed_articles')
        .select('id, title, entities_json')
        .eq('id', articleId)
        .single();

    if (fetchErr || !article) {
        return { success: false, error: 'Article not found' };
    }

    const rawEntities = article.entities_json || {};

    // Skip if no entities to process
    if (Object.keys(rawEntities).length === 0) {
        return { success: true, skipped: true, reason: 'No entities to process' };
    }

    // Normalize entities
    const normalized = await normalizeEntities(rawEntities);

    // Count matched entities
    const stats = {
        movies_matched: normalized.movies?.filter(m => m.matched).length || 0,
        movies_total: normalized.movies?.length || 0,
        series_matched: normalized.series?.filter(s => s.matched).length || 0,
        series_total: normalized.series?.length || 0,
        people_count: normalized.people?.length || 0,
        studios_count: normalized.studios?.length || 0,
    };

    // Update article
    const { error: updateErr } = await supabase
        .from('feed_articles')
        .update({
            entities_json: normalized,
            updated_at: new Date().toISOString(),
        })
        .eq('id', articleId);

    if (updateErr) {
        console.error('[news-entities] Update failed:', updateErr.message);
        return { success: false, error: updateErr.message };
    }

    // Log processing
    await supabase.from('news_processing_logs').insert({
        article_id: articleId,
        step: 'entity_extraction',
        status: 'success',
        message: `Matched ${stats.movies_matched}/${stats.movies_total} movies, ${stats.series_matched}/${stats.series_total} series`,
        metadata_json: stats,
        duration_ms: Date.now() - startTime,
    });

    return {
        success: true,
        normalized,
        stats,
    };
}

/**
 * Extract key entities for clustering (simplified for comparison)
 */
export function extractClusteringEntities(entitiesJson) {
    const entities = entitiesJson || {};
    const key = [];

    // Add movie TMDB IDs
    if (entities.movies?.length) {
        for (const m of entities.movies) {
            if (m.tmdb_id) key.push(`movie:${m.tmdb_id}`);
            else if (m.title) key.push(`movie:${m.title.toLowerCase()}`);
        }
    }

    // Add series TMDB IDs
    if (entities.series?.length) {
        for (const s of entities.series) {
            if (s.tmdb_id) key.push(`tv:${s.tmdb_id}`);
            else if (s.title) key.push(`tv:${s.title.toLowerCase()}`);
        }
    }

    // Add key people
    if (entities.people?.length) {
        for (const p of entities.people) {
            if (p.name) key.push(`person:${p.name.toLowerCase()}`);
        }
    }

    // Add franchises
    if (entities.franchises?.length) {
        for (const f of entities.franchises) {
            key.push(`franchise:${f.toLowerCase()}`);
        }
    }

    return key;
}

/**
 * Calculate entity overlap between two articles (for clustering)
 */
export function calculateEntityOverlap(entities1, entities2) {
    const key1 = new Set(extractClusteringEntities(entities1));
    const key2 = new Set(extractClusteringEntities(entities2));

    if (key1.size === 0 || key2.size === 0) return 0;

    const intersection = [...key1].filter(k => key2.has(k)).length;
    const union = new Set([...key1, ...key2]).size;

    return union > 0 ? intersection / union : 0;
}
