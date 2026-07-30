import { LIBRARY_CARD_SELECT } from '../moviesLibrarySelect.js';
import { supabase } from '../supabaseClient.js';

// =============================================
// ADMIN COLLECTIONS (CMS)
// =============================================

export const getCollections = async () => {
    const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('display_order', { ascending: true });

    if (error) {
        console.error('Error fetching collections:', error);
        return [];
    }
    return data || [];
};

export const createCollection = async (collection) => {
    const { data, error } = await supabase
        .from('collections')
        .insert(collection)
        .select();

    if (error) {
        console.error('Error creating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const updateCollectionAdmin = async (slug, updates) => {
    const { data, error } = await supabase
        .from('collections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('slug', slug)
        .select();

    if (error) {
        console.error('Error updating collection:', error);
        return { success: false, error };
    }
    return { success: true, data };
};

export const deleteCollection = async (slug) => {
    const { error } = await supabase
        .from('collections')
        .delete()
        .eq('slug', slug);

    if (error) {
        console.error('Error deleting collection:', error);
        return { success: false, error };
    }
    return { success: true };
};

export const updateCollection = async (slug, updates) => updateCollectionAdmin(slug, updates);

// =============================================
// USER LISTS (user_collections) — NOT Boards
// =============================================

export const COLLECTION_SORT_OPTIONS = [
    { id: 'added_desc', label: 'Date added · newest' },
    { id: 'added_asc', label: 'Date added · oldest' },
    { id: 'release_desc', label: 'Release date · newest' },
    { id: 'release_asc', label: 'Release date · oldest' },
    { id: 'title_asc', label: 'Title · A–Z' },
    { id: 'title_desc', label: 'Title · Z–A' },
    { id: 'custom', label: 'Custom order (drag)' },
];

const COLLECTION_SORT_IDS = new Set(COLLECTION_SORT_OPTIONS.map((o) => o.id));

export function normalizeCollectionItemsSort(value, collection = null) {
    if (value && COLLECTION_SORT_IDS.has(value)) return value;
    const isFranchise = collection?.category === 'franchise'
        || (Array.isArray(collection?.tags) && collection.tags.includes('franchise'))
        || /marvel cinematic universe/i.test(collection?.name || '');
    return isFranchise ? 'release_asc' : 'added_desc';
}

/** Sort list items by saved preference (or franchise default). */
export function sortCollectionMovies(movies, mode = 'added_desc') {
    if (!Array.isArray(movies) || movies.length < 2) return movies || [];
    const list = [...movies];
    const titleOf = (m) => String(m.movie_title || m.title || '').toLowerCase();
    const releaseOf = (m) => String(m.release_date || m.first_air_date || '');
    const addedOf = (m) => new Date(m.added_at || m.created_at || 0).getTime() || 0;

    switch (mode) {
        case 'added_asc':
            return list.sort((a, b) => addedOf(a) - addedOf(b) || titleOf(a).localeCompare(titleOf(b)));
        case 'release_asc':
            return list.sort((a, b) => {
                const ar = releaseOf(a);
                const br = releaseOf(b);
                if (ar && br && ar !== br) return ar.localeCompare(br);
                if (ar && !br) return -1;
                if (!ar && br) return 1;
                return titleOf(a).localeCompare(titleOf(b));
            });
        case 'release_desc':
            return list.sort((a, b) => {
                const ar = releaseOf(a);
                const br = releaseOf(b);
                if (ar && br && ar !== br) return br.localeCompare(ar);
                if (ar && !br) return -1;
                if (!ar && br) return 1;
                return titleOf(a).localeCompare(titleOf(b));
            });
        case 'title_asc':
            return list.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
        case 'title_desc':
            return list.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
        case 'custom':
            return list.sort((a, b) => {
                const ao = Number.isFinite(a.sort_order) ? a.sort_order : Number.MAX_SAFE_INTEGER;
                const bo = Number.isFinite(b.sort_order) ? b.sort_order : Number.MAX_SAFE_INTEGER;
                if (ao !== bo) return ao - bo;
                return addedOf(b) - addedOf(a) || titleOf(a).localeCompare(titleOf(b));
            });
        case 'added_desc':
        default:
            return list.sort((a, b) => addedOf(b) - addedOf(a) || titleOf(a).localeCompare(titleOf(b)));
    }
}

function sortCollectionMoviesNewestFirst(movies) {
    return sortCollectionMovies(movies, 'added_desc');
}

export const getUserCollections = async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
        .from('user_collections')
        .select('*, collection_movies(movie_id, poster_path, movie_title, added_at)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('added_at', { foreignTable: 'collection_movies', ascending: false });
    const mapped = (data || []).map((c) => ({
        ...c,
        collection_movies: sortCollectionMoviesNewestFirst(c.collection_movies),
    }));
    return fillMissingCollectionPosters(mapped);
};

export const LIST_NAME_MAX = 70;
export const LIST_DESCRIPTION_MAX = 200;

/** Tags that require admin approval before Explore surfacing. */
export const GATED_COLLECTION_TAGS = ['franchise'];

const createSlug = (text) =>
    String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

/** Public URL for a list — always include ?u=owner when known (slug collisions). */
export function collectionPublicPath(collection, ownerUsername = null) {
    const slug = collection?.slug || createSlug(collection?.name) || collection?.id;
    if (!slug) return '/';
    const u = ownerUsername
        || collection?.user_profiles?.username
        || collection?.owner?.username
        || collection?.owner_username
        || null;
    if (u) return `/collection/${slug}?u=${encodeURIComponent(String(u).replace(/^@/, ''))}`;
    return `/collection/${slug}`;
}
const normalizeTags = (tags) =>
    [...new Set((Array.isArray(tags) ? tags : [])
        .map((t) => String(t || '').toLowerCase().trim())
        .filter(Boolean))];

const hasFranchiseTag = (tags) => normalizeTags(tags).includes('franchise');

/** Poster paths suitable for collage / cover (skips empties). */
export function getCollectionPosterPaths(collection, limit = 4) {
    const paths = (collection?.collection_movies || [])
        .map((m) => m?.poster_path)
        .filter((p) => typeof p === 'string' && p.trim().length > 0);
    return paths.slice(0, limit);
}

/** Cover for feed/cards: uploaded cover_image, else first movie poster(s). */
export function resolveCollectionCoverUrl(collection) {
    const cover = collection?.cover_image || collection?.banner_image || null;
    if (cover && /^https?:\/\//i.test(cover)) return cover;
    if (cover && cover.startsWith('/')) {
        return `https://image.tmdb.org/t/p/w342${cover}`;
    }
    if (cover) return cover;

    const posters = getCollectionPosterPaths(collection, 1);
    if (!posters.length) return null;
    const path = posters[0];
    if (/^https?:\/\//i.test(path)) return path;
    return `https://image.tmdb.org/t/p/w342${path}`;
}

/**
 * Fill missing collection_movies.poster_path from movies_library so list
 * thumbnails / collages work without a custom uploaded cover.
 */
export async function fillMissingCollectionPosters(collections) {
    const list = Array.isArray(collections) ? collections : [collections];
    const missingIds = [];
    for (const c of list) {
        for (const m of c?.collection_movies || []) {
            if (!m?.poster_path && m?.movie_id != null) missingIds.push(String(m.movie_id));
        }
    }
    if (!missingIds.length) return collections;

    const unique = [...new Set(missingIds)];
    const posterMap = new Map();
    const chunkSize = 100;
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const { data } = await supabase
            .from('movies_library')
            .select('tmdb_id, poster_path')
            .in('tmdb_id', chunk)
            .not('poster_path', 'is', null);
        for (const row of data || []) {
            if (row.poster_path) posterMap.set(String(row.tmdb_id), row.poster_path);
        }
    }
    if (!posterMap.size) return collections;

    const persist = [];
    const apply = (c) => {
        if (!c?.collection_movies?.length) return c;
        const collection_movies = c.collection_movies.map((m) => {
            if (m.poster_path || m.movie_id == null) return m;
            const poster_path = posterMap.get(String(m.movie_id));
            if (!poster_path) return m;
            if (c.id) {
                persist.push({
                    collection_id: c.id,
                    movie_id: String(m.movie_id),
                    poster_path,
                });
            }
            return { ...m, poster_path };
        });
        return { ...c, collection_movies };
    };

    const result = Array.isArray(collections) ? collections.map(apply) : apply(collections);

    // Persist so next load / feed cover sync has posters without re-joining library
    if (persist.length) {
        Promise.all(
            persist.slice(0, 60).map((row) =>
                supabase
                    .from('collection_movies')
                    .update({ poster_path: row.poster_path })
                    .eq('collection_id', row.collection_id)
                    .eq('movie_id', row.movie_id)
                    .is('poster_path', null),
            ),
        ).catch(() => {});
    }

    return result;
}

/**
 * Keep the Home feed list card in sync with the collection's cover / posters.
 */
export async function syncListPostCover(collectionId) {
    if (!collectionId) return;

    const { data: collection } = await supabase
        .from('user_collections')
        .select('id, name, user_id, is_public, cover_image, banner_image, collection_movies(movie_id, poster_path)')
        .eq('id', collectionId)
        .maybeSingle();

    if (!collection?.is_public || !collection.user_id) return;

    const enriched = await fillMissingCollectionPosters(collection);
    const cover = resolveCollectionCoverUrl(enriched);
    if (!cover) return;

    const { data: posts } = await supabase
        .from('feed_posts')
        .select('id, media_items, image_url')
        .eq('user_id', collection.user_id)
        .eq('post_type', 'list')
        .eq('movie_title', collection.name)
        .order('created_at', { ascending: false })
        .limit(3);

    const targets = (posts || []).filter((p) => {
        const mid = p.media_items?.collectionId;
        return !mid || mid === collection.id;
    });
    if (!targets.length) return;

    await Promise.all(targets.map((p) => {
        const media = {
            ...(typeof p.media_items === 'object' && p.media_items && !Array.isArray(p.media_items)
                ? p.media_items
                : {}),
            kind: 'list',
            collectionId: collection.id,
            name: collection.name,
            coverImage: cover,
        };
        return supabase
            .from('feed_posts')
            .update({
                has_image: true,
                image_url: cover,
                media_items: media,
                updated_at: new Date().toISOString(),
            })
            .eq('id', p.id);
    }));
}

export const createUserCollection = async (userId, name, description = '', isPublic = false, options = {}) => {
    if (!userId) return { success: false };
    const cleanName = name.trim().slice(0, LIST_NAME_MAX);
    const cleanDescription = (description || '').trim().slice(0, LIST_DESCRIPTION_MAX);
    const tags = normalizeTags(options.tags);
    const isFranchise = hasFranchiseTag(tags) || options.category === 'franchise';

    const row = {
        user_id: userId,
        name: cleanName,
        description: cleanDescription,
        is_public: isPublic,
        category: isFranchise ? 'franchise' : 'list',
        tags: isFranchise ? [...new Set([...tags, 'franchise'])] : tags,
        moderation_status: isFranchise ? 'pending' : 'none',
    };

    let { data, error } = await supabase
        .from('user_collections')
        .insert(row)
        .select('id, user_id, name, description, is_public, category, tags, moderation_status, cover_image, banner_image, created_at, updated_at, is_system, collection_kind')
        .single();

    // Pre-migration DBs may not have category / moderation_status / tags yet.
    if (error && /(category|moderation_status|tags)/i.test(error.message || '')) {
        ({ data, error } = await supabase
            .from('user_collections')
            .insert({
                user_id: userId,
                name: cleanName,
                description: cleanDescription,
                is_public: isPublic,
            })
            .select('id, user_id, name, description, is_public, created_at, updated_at')
            .single());
    }

    // If RETURNING omitted name (RLS), re-fetch the row we just wrote.
    if (!error && data?.id && !data.name) {
        const { data: refetched } = await supabase
            .from('user_collections')
            .select('id, user_id, name, description, is_public, category, tags, moderation_status, cover_image, banner_image, created_at, updated_at, is_system, collection_kind')
            .eq('id', data.id)
            .maybeSingle();
        if (refetched) data = refetched;
    }

    if (!error && isPublic) {
        await supabase.from('activity_feed').insert({
            user_id: userId,
            event_type: 'list_created',
            payload: { collection_id: data.id, name: cleanName, description: cleanDescription },
            visibility: 'public',
            engagement_score: 5,
        });

        const cover = resolveCollectionCoverUrl({ ...data, name: cleanName });
        await supabase.from('feed_posts').insert({
            user_id: userId,
            content: cleanDescription ? `${cleanName}\n${cleanDescription}` : cleanName,
            movie_title: cleanName,
            post_type: 'list',
            has_image: !!cover,
            image_url: cover,
            visibility: 'public',
            media_items: {
                kind: 'list',
                collectionId: data.id,
                name: cleanName,
                coverImage: cover,
            },
        }).then(({ error: feedErr }) => {
            if (feedErr) console.warn('list -> feed_posts failed:', feedErr.message);
        });
    }

    // Always hydrate name/description — insert RETURNING can omit columns under some RLS setups,
    // which left the UI showing "Untitled collection" until a full reload.
    const hydrated = data
        ? {
            ...data,
            name: data.name || cleanName,
            description: data.description ?? cleanDescription,
            is_public: data.is_public ?? isPublic,
            collection_movies: Array.isArray(data.collection_movies) ? data.collection_movies : [],
        }
        : null;

    return { success: !error && !!hydrated, data: hydrated, error };
};

export const getCollectionBySlug = async (slug, viewerUserId = null, options = {}) => {
    if (!slug) return null;

    const ownerUsername = options.ownerUsername
        ? String(options.ownerUsername).trim().replace(/^@/, '')
        : null;
    let ownerUserId = options.ownerUserId || null;

    if (!ownerUserId && ownerUsername) {
        const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('id')
            .ilike('username', ownerUsername)
            .maybeSingle();
        ownerUserId = ownerProfile?.id || null;
        // Unknown owner username → no match (avoid falling back to viewer’s list)
        if (!ownerUserId) return null;
    }

    // 1) Load collection rows (no nested movies — avoids PostgREST embed truncation)
    let query = supabase
        .from('user_collections')
        .select('*')
        .order('created_at', { ascending: false });

    if (ownerUserId) {
        // Exact owner — do not prefer the logged-in viewer when slugs collide
        query = query.eq('user_id', ownerUserId);
    } else if (viewerUserId) {
        query = query.or(`is_public.eq.true,user_id.eq.${viewerUserId}`);
    } else {
        query = query.eq('is_public', true);
    }

    const { data: collections, error } = await query;
    if (error) {
        console.error('Error fetching collections:', error);
        return null;
    }

    const matches = (collections || []).filter((c) =>
        c.id === slug
        || (c.slug && String(c.slug) === slug)
        || createSlug(c.name) === slug,
    );
    if (!matches.length) return null;

    let collection;
    if (ownerUserId) {
        collection = matches.find((c) => c.user_id === ownerUserId) || matches[0];
    } else if (matches.length === 1) {
        collection = matches[0];
    } else {
        // Slug collisions (e.g. every user has "Watched in Theaters"): never
        // auto-pick the viewer's list — that leaked avatars/movies onto other
        // profiles' public views. Prefer a single public match; if many publics
        // share the slug, require ?u=owner (callers should pass ownerUsername).
        const publicMatches = matches.filter((c) => c.is_public);
        const own = viewerUserId
            ? matches.find((c) => c.user_id === viewerUserId)
            : null;
        if (publicMatches.length === 1) {
            collection = publicMatches[0];
        } else if (publicMatches.length > 1) {
            // Ambiguous without owner — do not guess (especially not "own")
            return null;
        } else {
            collection = own || null;
        }
    }

    // Private list: only owner (or collaborator path later) may view
    if (collection && !collection.is_public && collection.user_id !== viewerUserId) {
        return null;
    }

    // 2) Load items for this collection only
    let movies = null;
    let moviesError = null;
    {
        const ordered = await supabase
            .from('collection_movies')
            .select('*')
            .eq('collection_id', collection.id)
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('added_at', { ascending: false });
        if (ordered.error && /sort_order/i.test(ordered.error.message || '')) {
            const fallback = await supabase
                .from('collection_movies')
                .select('*')
                .eq('collection_id', collection.id)
                .order('added_at', { ascending: false });
            movies = fallback.data;
            moviesError = fallback.error;
        } else {
            movies = ordered.data;
            moviesError = ordered.error;
        }
    }

    if (moviesError) {
        console.error('Error fetching collection movies:', moviesError);
        collection.collection_movies = [];
    } else {
        collection.collection_movies = movies || [];
    }

    if (collection.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_id, avatar_url, is_verified')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    // Collaborators (official account after franchise approve, etc.)
    {
        const { data: collabRows } = await supabase
            .from('collection_collaborators')
            .select('user_id, role')
            .eq('collection_id', collection.id);
        const collabIds = (collabRows || [])
            .map((r) => r.user_id)
            .filter((id) => id && id !== collection.user_id);
        if (collabIds.length) {
            const { data: collabProfiles } = await supabase
                .from('user_profiles')
                .select('id, username, display_name, avatar_id, avatar_url, is_verified')
                .in('id', collabIds);
            const roleByUser = new Map((collabRows || []).map((r) => [r.user_id, r.role]));
            collection.collaborators = (collabProfiles || []).map((p) => ({
                ...p,
                role: roleByUser.get(p.id) || 'collaborator',
            }));
        } else {
            collection.collaborators = [];
        }
    }

    if (collection.collection_movies?.length) {
        const movieIds = collection.collection_movies.map((m) => String(m.movie_id));
        // Chunk .in() queries — PostgREST/URL limits on very large lists
        const chunkSize = 100;
        const movieMap = new Map();
        for (let i = 0; i < movieIds.length; i += chunkSize) {
            const chunk = movieIds.slice(i, i + chunkSize);
            const { data: libraryMovies } = await supabase
                .from('movies_library')
                .select(LIBRARY_CARD_SELECT)
                .in('tmdb_id', chunk);
            (libraryMovies || []).forEach((m) => movieMap.set(String(m.tmdb_id), m));
        }

        if (movieMap.size) {
            collection.collection_movies = collection.collection_movies.map((collMovie) => {
                const libraryMovie = movieMap.get(String(collMovie.movie_id));
                if (!libraryMovie) return collMovie;
                return {
                    ...collMovie,
                    poster_path: libraryMovie.poster_path || collMovie.poster_path,
                    backdrop_path: libraryMovie.backdrop_path,
                    title: libraryMovie.title || collMovie.movie_title,
                    vote_average: libraryMovie.vote_average,
                    release_date: libraryMovie.release_date || libraryMovie.first_air_date || collMovie.release_date,
                    overview: libraryMovie.overview,
                    genres: libraryMovie.genres,
                    runtime: libraryMovie.runtime,
                };
            });
        }
        const sortMode = normalizeCollectionItemsSort(collection.items_sort, collection);
        collection.items_sort = sortMode;
        collection.collection_movies = sortCollectionMovies(collection.collection_movies, sortMode);
    }

    // Persist any library-filled posters so list cards / feed covers stay populated
    const enriched = await fillMissingCollectionPosters(collection);
    return enriched;
};

export const updateUserCollection = async (collectionId, updates) => {
    const { data: existing } = await supabase
        .from('user_collections')
        .select('is_system, collection_kind, tags, category, moderation_status')
        .eq('id', collectionId)
        .maybeSingle();

    const patch = existing?.is_system
        ? { description: updates.description, is_public: updates.is_public }
        : { name: updates.name, description: updates.description, is_public: updates.is_public };

    if (updates.cover_image !== undefined) patch.cover_image = updates.cover_image;
    if (updates.banner_image !== undefined) patch.banner_image = updates.banner_image;
    if (updates.items_sort !== undefined) {
        const mode = updates.items_sort && COLLECTION_SORT_IDS.has(updates.items_sort)
            ? updates.items_sort
            : null;
        patch.items_sort = mode;
    }

    if (!existing?.is_system && updates.tags !== undefined) {
        const tags = normalizeTags(updates.tags);
        const isFranchise = hasFranchiseTag(tags);
        patch.tags = isFranchise ? [...new Set([...tags, 'franchise'])] : tags.filter((t) => t !== 'franchise');
        patch.category = isFranchise ? 'franchise' : 'list';
        if (isFranchise && existing.moderation_status !== 'approved') {
            patch.moderation_status = 'pending';
        }
        if (!isFranchise) {
            patch.moderation_status = 'none';
        }
    } else if (!existing?.is_system && updates.franchise !== undefined) {
        const tags = normalizeTags(existing.tags);
        const isFranchise = !!updates.franchise;
        patch.tags = isFranchise
            ? [...new Set([...tags, 'franchise'])]
            : tags.filter((t) => t !== 'franchise');
        patch.category = isFranchise ? 'franchise' : 'list';
        if (isFranchise && existing.moderation_status !== 'approved') {
            patch.moderation_status = 'pending';
        }
        if (!isFranchise) patch.moderation_status = 'none';
    }

    let { data, error } = await supabase
        .from('user_collections')
        .update(patch)
        .eq('id', collectionId)
        .select()
        .single();

    // Pre-migration DBs may not have items_sort yet
    if (error && /items_sort/i.test(error.message || '') && 'items_sort' in patch) {
        const { items_sort: _ignored, ...withoutSort } = patch;
        ({ data, error } = await supabase
            .from('user_collections')
            .update(withoutSort)
            .eq('id', collectionId)
            .select()
            .single());
        if (!error && updates.items_sort) {
            console.warn('items_sort column missing — run 20260731000000_collection_items_sort.sql');
        }
    }

    if (error) console.error('Error updating collection:', error);
    // Uploaded cover changed, or cleared → refresh feed thumb from posters
    if (!error) {
        syncListPostCover(collectionId).catch(() => {});
    }
    return { success: !error, data, error };
};

export const addToCollection = async (collectionId, movieId, movieTitle, posterPath, mediaType = 'movie') => {
    const movieKey = String(movieId);
    const { data, error } = await supabase
        .from('collection_movies')
        .upsert(
            {
                collection_id: collectionId,
                movie_id: movieKey,
                movie_title: movieTitle,
                poster_path: posterPath,
                media_type: mediaType,
            },
            { onConflict: 'collection_id,movie_id' },
        )
        .select();

    if (error) {
        console.error('Error adding to collection:', error);
        return { success: false, error, data };
    }
    // First posters become the feed thumbnail for "New list" posts
    syncListPostCover(collectionId).catch(() => {});
    return { success: true, error: null, data };
};

export const removeFromCollection = async (collectionId, movieId) => {
    const { error } = await supabase
        .from('collection_movies')
        .delete()
        .eq('collection_id', collectionId)
        .eq('movie_id', movieId);
    if (!error) syncListPostCover(collectionId).catch(() => {});
    return { success: !error, error };
};

export const getCollection = async (collectionId) => {
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('id', collectionId)
        .order('added_at', { foreignTable: 'collection_movies', ascending: false })
        .single();

    if (error) {
        console.error('Error fetching collection:', error);
        return null;
    }

    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name, avatar_id, avatar_url')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    if (collection?.collection_movies) {
        collection.collection_movies = sortCollectionMoviesNewestFirst(collection.collection_movies);
    }
    return collection;
};

export const getCollectionByName = async (userId, collectionName) => {
    const { data: collection, error } = await supabase
        .from('user_collections')
        .select('*, collection_movies(*)')
        .eq('user_id', userId)
        .eq('name', collectionName)
        .order('created_at', { ascending: false })
        .order('added_at', { foreignTable: 'collection_movies', ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('Error fetching collection by name:', error);
        return null;
    }

    if (collection?.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name, avatar_id, avatar_url')
            .eq('id', collection.user_id)
            .maybeSingle();
        collection.user_profiles = profile || null;
    }

    if (collection?.collection_movies) {
        collection.collection_movies = sortCollectionMoviesNewestFirst(collection.collection_movies);
    }
    return collection;
};

export const addMoviesToCollection = async (collectionId, movies) => {
    const byMovieId = new Map();
    for (const m of movies || []) {
        const movieId = String(m.id ?? m.tmdb_id ?? m.movie_id);
        if (!movieId) continue;
        byMovieId.set(movieId, {
            collection_id: collectionId,
            movie_id: movieId,
            movie_title: m.title || m.name || m.movie_title,
            poster_path: m.poster_path,
            media_type: m.media_type || 'movie',
        });
    }

    const records = Array.from(byMovieId.values());
    if (!records.length) return { success: false, error: new Error('No movies to add') };

    // Append after current max sort_order when using custom order
    const { data: existingRows } = await supabase
        .from('collection_movies')
        .select('sort_order')
        .eq('collection_id', collectionId);
    let nextOrder = 0;
    for (const row of existingRows || []) {
        if (Number.isFinite(row.sort_order) && row.sort_order >= nextOrder) {
            nextOrder = row.sort_order + 1;
        }
    }
    const recordsWithOrder = records.map((r, i) => ({ ...r, sort_order: nextOrder + i }));

    let { data, error } = await supabase
        .from('collection_movies')
        .upsert(recordsWithOrder, { onConflict: 'collection_id,movie_id' })
        .select();

    if (error && /sort_order/i.test(error.message || '')) {
        ({ data, error } = await supabase
            .from('collection_movies')
            .upsert(records, { onConflict: 'collection_id,movie_id' })
            .select());
    }

    if (error) console.error('Error adding movies:', error);
    if (!error) syncListPostCover(collectionId).catch(() => {});
    return { success: !error, error, data };
};

/** Persist manual drag order (0-based). Also sets items_sort = custom when possible. */
export const reorderCollectionMovies = async (collectionId, orderedMovieIds = []) => {
    if (!collectionId || !orderedMovieIds.length) {
        return { success: false, error: new Error('Nothing to reorder') };
    }

    const results = await Promise.all(
        orderedMovieIds.map((movieId, index) =>
            supabase
                .from('collection_movies')
                .update({ sort_order: index })
                .eq('collection_id', collectionId)
                .eq('movie_id', String(movieId)),
        ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
        console.error('reorderCollectionMovies:', failed.error);
        return { success: false, error: failed.error };
    }

    const { error: sortErr } = await supabase
        .from('user_collections')
        .update({ items_sort: 'custom' })
        .eq('id', collectionId);
    if (sortErr && !/items_sort/i.test(sortErr.message || '')) {
        console.warn('reorderCollectionMovies items_sort:', sortErr.message);
    }

    return { success: true, error: null };
};

/** Delete a user list. System lists (e.g. Watched in Theaters) cannot be deleted. */
export const deleteUserCollection = async (collectionId, userId) => {
    if (!collectionId || !userId) return { success: false, error: new Error('Missing id') };

    const { data: existing } = await supabase
        .from('user_collections')
        .select('id, user_id, is_system, collection_kind')
        .eq('id', collectionId)
        .maybeSingle();

    if (!existing || existing.user_id !== userId) {
        return { success: false, error: new Error('Collection not found') };
    }
    if (existing.is_system || existing.collection_kind === 'watched_in_theater') {
        return { success: false, error: new Error('System collections cannot be deleted') };
    }

    const { error } = await supabase
        .from('user_collections')
        .delete()
        .eq('id', collectionId)
        .eq('user_id', userId);

    if (error) console.error('Error deleting collection:', error);
    return { success: !error, error };
};

// =============================================
// FRANCHISE TAG MODERATION (user tags → admin approve)
// =============================================

/** Admin queue: franchise-tagged collections (pending / approved / rejected). */
export const getFranchiseModerationQueue = async ({ status = 'pending', limit = 80 } = {}) => {
    let query = supabase
        .from('user_collections')
        .select('id, name, slug, description, user_id, is_public, created_at, category, tags, moderation_status, cover_image, collection_movies(movie_id, poster_path, movie_title)')
        .eq('category', 'franchise')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status && status !== 'all') {
        query = query.eq('moderation_status', status);
    }

    const { data, error } = await query;
    if (error) {
        console.error('getFranchiseModerationQueue:', error);
        return [];
    }

    const userIds = [...new Set((data || []).map((c) => c.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
        ? await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_url, avatar_id')
            .in('id', userIds)
        : { data: [] };
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    return (data || []).map((c) => ({
        ...c,
        owner: profileMap.get(c.user_id) || null,
        collection_movies: sortCollectionMoviesNewestFirst(c.collection_movies),
        movie_count: c.collection_movies?.length || 0,
    }));
};

/** Admin: approve / reject a franchise-tagged collection. */
export const setCollectionModerationStatus = async (collectionId, status) => {
    if (!collectionId || !['approved', 'rejected', 'pending'].includes(status)) {
        return { success: false, error: { message: 'Invalid request' } };
    }
    const { error } = await supabase.rpc('admin_set_collection_moderation', {
        p_collection_id: collectionId,
        p_status: status,
    });
    if (error) {
        console.error('setCollectionModerationStatus:', error);
        return { success: false, error };
    }
    return { success: true };
};
