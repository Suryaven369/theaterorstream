import { supabase } from '../supabaseClient.js';

export const BOARD_TITLE_MAX = 80;
export const BOARD_DESCRIPTION_MAX = 280;
export const BOARD_NOTE_MAX = 500;

export function createBoardSlug(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim() || 'board';
}

export function boardPath(board, username) {
    const slug = board?.slug || createBoardSlug(board?.title);
    const user = username || board?.user_profiles?.username || board?.owner_username;
    if (user && slug) return `/${user}/boards/${slug}`;
    if (slug) return `/boards/${slug}`;
    return '/boards';
}

function sortBoardItems(items) {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
        if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
        const ao = Number.isFinite(a.sort_order) ? a.sort_order : 9999;
        const bo = Number.isFinite(b.sort_order) ? b.sort_order : 9999;
        if (ao !== bo) return ao - bo;
        return new Date(a.added_at || 0) - new Date(b.added_at || 0);
    });
}

async function attachOwner(board) {
    if (!board?.user_id) return board;
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('username, display_name, avatar_id, avatar_url')
        .eq('id', board.user_id)
        .maybeSingle();
    board.user_profiles = profile || null;
    return board;
}

async function logBoardActivity(boardId, actorId, eventType, payload = {}) {
    try {
        await supabase.from('board_activity').insert({
            board_id: boardId,
            actor_id: actorId,
            event_type: eventType,
            payload,
        });
    } catch (err) {
        if (import.meta.env.DEV) console.warn('board_activity:', err?.message || err);
    }
}

export async function getUserBoards(userId, { publicOnly = false } = {}) {
    if (!userId) return [];
    let query = supabase
        .from('boards')
        .select('*, board_items(id, item_type, item_id, title, image_path, sort_order, is_pinned, added_at)')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
    if (publicOnly) query = query.eq('is_public', true);
    const { data, error } = await query;
    if (error) {
        console.error('getUserBoards:', error);
        return [];
    }
    return (data || []).map((b) => ({
        ...b,
        board_items: sortBoardItems(b.board_items).slice(0, 6),
    }));
}

export async function createBoard(userId, { title, description = '', isPublic = true, tags = [] } = {}) {
    if (!userId || !title?.trim()) return { success: false, error: new Error('Title required') };
    const cleanTitle = title.trim().slice(0, BOARD_TITLE_MAX);
    const cleanDescription = (description || '').trim().slice(0, BOARD_DESCRIPTION_MAX);
    const slug = createBoardSlug(cleanTitle);

    const { data, error } = await supabase
        .from('boards')
        .insert({
            user_id: userId,
            title: cleanTitle,
            description: cleanDescription,
            is_public: !!isPublic,
            slug,
            tags: Array.isArray(tags) ? tags : [],
        })
        .select()
        .single();

    if (error) {
        console.error('createBoard:', error);
        return { success: false, error };
    }

    await logBoardActivity(data.id, userId, 'created', { title: cleanTitle, slug: data.slug });

    if (isPublic) {
        await supabase.from('activity_feed').insert({
            user_id: userId,
            event_type: 'board_created',
            payload: { board_id: data.id, title: cleanTitle, slug: data.slug },
            visibility: 'public',
            engagement_score: 6,
        });

        await supabase.from('feed_posts').insert({
            user_id: userId,
            content: cleanDescription ? `${cleanTitle}\n${cleanDescription}` : cleanTitle,
            movie_title: cleanTitle,
            post_type: 'board',
            has_image: false,
            visibility: 'public',
        }).then(({ error: feedErr }) => {
            if (feedErr) console.warn('board -> feed_posts:', feedErr.message);
        });
    }

    return { success: true, data };
}

export async function getBoardBySlug(slug, viewerUserId = null, ownerUsername = null) {
    if (!slug) return null;

    let ownerId = null;
    if (ownerUsername) {
        const { data: owner } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('username', ownerUsername)
            .maybeSingle();
        ownerId = owner?.id || null;
        if (!ownerId) return null;
    }

    let query = supabase
        .from('boards')
        .select('*, board_items(*)')
        .eq('slug', slug)
        .limit(5);

    if (ownerId) query = query.eq('user_id', ownerId);
    if (viewerUserId) {
        query = query.or(`is_public.eq.true,user_id.eq.${viewerUserId}`);
    } else {
        query = query.eq('is_public', true);
    }

    const { data: matches, error } = await query;
    if (error) {
        console.error('getBoardBySlug:', error);
        return null;
    }

    const board = matches?.[0] || null;
    if (!board) return null;

    board.board_items = sortBoardItems(board.board_items);
    await attachOwner(board);
    return board;
}

export async function updateBoard(boardId, updates) {
    const patch = {};
    if (updates.title !== undefined) patch.title = String(updates.title).trim().slice(0, BOARD_TITLE_MAX);
    if (updates.description !== undefined) patch.description = String(updates.description || '').trim().slice(0, BOARD_DESCRIPTION_MAX);
    if (updates.is_public !== undefined) patch.is_public = updates.is_public;
    if (updates.cover_image !== undefined) patch.cover_image = updates.cover_image;
    if (updates.banner_image !== undefined) patch.banner_image = updates.banner_image;
    if (updates.show_notes !== undefined) patch.show_notes = updates.show_notes;
    if (updates.layout_mode !== undefined) patch.layout_mode = updates.layout_mode;
    if (updates.tags !== undefined) patch.tags = updates.tags;
    if (updates.slug !== undefined) patch.slug = createBoardSlug(updates.slug);
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('boards')
        .update(patch)
        .eq('id', boardId)
        .select()
        .single();

    return { success: !error, data, error };
}

export async function deleteBoard(boardId, userId) {
    const { error } = await supabase
        .from('boards')
        .delete()
        .eq('id', boardId)
        .eq('user_id', userId);
    return { success: !error, error };
}

export async function addBoardItem(boardId, item, actorId) {
    const { data: existing } = await supabase
        .from('board_items')
        .select('sort_order')
        .eq('board_id', boardId)
        .order('sort_order', { ascending: false })
        .limit(1);
    const sort_order = (existing?.[0]?.sort_order ?? -1) + 1;

    const row = {
        board_id: boardId,
        item_type: item.item_type,
        item_id: String(item.item_id),
        title: item.title,
        subtitle: item.subtitle || null,
        image_path: item.image_path || null,
        note: item.note || null,
        sort_order,
        is_pinned: !!item.is_pinned,
    };

    const { data, error } = await supabase
        .from('board_items')
        .upsert(row, { onConflict: 'board_id,item_type,item_id' })
        .select()
        .single();

    if (!error && actorId) {
        await logBoardActivity(boardId, actorId, 'item_added', {
            item_type: row.item_type,
            item_id: row.item_id,
            title: row.title,
        });
    }

    return { success: !error, data, error };
}

export async function addBoardItems(boardId, items, actorId) {
    const results = [];
    for (const item of items || []) {
        results.push(await addBoardItem(boardId, item, actorId));
    }
    return { success: results.every((r) => r.success), results };
}

export async function removeBoardItem(boardId, itemId) {
    const { error } = await supabase
        .from('board_items')
        .delete()
        .eq('board_id', boardId)
        .eq('id', itemId);
    return { success: !error, error };
}

export async function updateBoardItem(itemId, patch) {
    const allowed = {};
    if (patch.note !== undefined) allowed.note = patch.note;
    if (patch.is_pinned !== undefined) allowed.is_pinned = patch.is_pinned;
    if (patch.sort_order !== undefined) allowed.sort_order = patch.sort_order;
    if (patch.title !== undefined) allowed.title = patch.title;
    if (patch.subtitle !== undefined) allowed.subtitle = patch.subtitle;
    if (patch.image_path !== undefined) allowed.image_path = patch.image_path;

    const { data, error } = await supabase
        .from('board_items')
        .update(allowed)
        .eq('id', itemId)
        .select()
        .single();
    return { success: !error, data, error };
}

/** Owner-only reorder. orderedIds = board_items.id in new order. */
export async function reorderBoardItems(boardId, orderedIds, actorId) {
    if (!boardId || !orderedIds?.length) return { success: false };
    const updates = orderedIds.map((id, index) =>
        supabase.from('board_items').update({ sort_order: index, is_pinned: false }).eq('id', id).eq('board_id', boardId),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (!failed) {
        await supabase.from('boards').update({ updated_at: new Date().toISOString() }).eq('id', boardId);
        if (actorId) await logBoardActivity(boardId, actorId, 'items_reordered', { count: orderedIds.length });
    }
    return { success: !failed, error: failed?.error };
}

export async function incrementBoardViews(boardId) {
    if (!boardId) return;
    try {
        await supabase.rpc('increment_board_views', { p_board_id: boardId });
    } catch (err) {
        if (import.meta.env.DEV) console.warn('incrementBoardViews:', err?.message || err);
    }
}

export async function toggleBoardLike(userId, boardId) {
    if (!userId || !boardId) return { success: false, liked: false };
    const { data: existing } = await supabase
        .from('board_likes')
        .select('board_id')
        .eq('user_id', userId)
        .eq('board_id', boardId)
        .maybeSingle();

    if (existing) {
        await supabase.from('board_likes').delete().eq('user_id', userId).eq('board_id', boardId);
        return { success: true, liked: false };
    }
    const { error } = await supabase.from('board_likes').insert({ user_id: userId, board_id: boardId });
    return { success: !error, liked: !error };
}

export async function isBoardLiked(userId, boardId) {
    if (!userId || !boardId) return false;
    const { data } = await supabase
        .from('board_likes')
        .select('board_id')
        .eq('user_id', userId)
        .eq('board_id', boardId)
        .maybeSingle();
    return !!data;
}

export async function getBoardComments(boardId, { limit = 40 } = {}) {
    const { data, error } = await supabase
        .from('board_comments')
        .select('id, board_id, user_id, content, parent_id, created_at')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getBoardComments:', error);
        return [];
    }

    const userIds = [...new Set((data || []).map((c) => c.user_id))];
    let profileMap = new Map();
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_url, avatar_id')
            .in('id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    return (data || []).map((c) => ({
        ...c,
        user_profiles: profileMap.get(c.user_id) || null,
    }));
}

export async function addBoardComment(boardId, userId, content, parentId = null) {
    const text = String(content || '').trim().slice(0, 1000);
    if (!text) return { success: false, error: new Error('Empty comment') };

    const { data, error } = await supabase
        .from('board_comments')
        .insert({
            board_id: boardId,
            user_id: userId,
            content: text,
            parent_id: parentId,
        })
        .select()
        .single();

    if (!error) {
        await logBoardActivity(boardId, userId, 'commented', { comment_id: data.id });
    }
    return { success: !error, data, error };
}

export async function deleteBoardComment(commentId, userId) {
    const { error } = await supabase
        .from('board_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);
    return { success: !error, error };
}

export async function exploreBoards({ sort = 'trending', limit = 24, offset = 0 } = {}) {
    let query = supabase
        .from('boards')
        .select('id, title, slug, description, cover_image, banner_image, likes_count, views_count, followers_count, comments_count, items_count, user_id, created_at, updated_at, tags, board_items(item_type, item_id, title, image_path, sort_order)')
        .eq('is_public', true)
        .range(offset, offset + limit - 1);

    if (sort === 'newest') query = query.order('created_at', { ascending: false });
    else if (sort === 'followed') query = query.order('followers_count', { ascending: false, nullsFirst: false });
    else if (sort === 'updated') query = query.order('updated_at', { ascending: false });
    else query = query.order('likes_count', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false });

    const { data, error } = await query;
    if (error) {
        console.error('exploreBoards:', error);
        return [];
    }

    const userIds = [...new Set((data || []).map((b) => b.user_id))];
    let profileMap = new Map();
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_url, avatar_id')
            .in('id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    return (data || []).map((b) => ({
        ...b,
        user_profiles: profileMap.get(b.user_id) || null,
        board_items: sortBoardItems(b.board_items || []).slice(0, 4),
    }));
}

/** Recent activity on boards the user follows (entity_follows target_type=board). */
export async function getFollowedBoardActivity(userId, { limit = 30 } = {}) {
    if (!userId) return [];

    const { data: follows } = await supabase
        .from('entity_follows')
        .select('target_id, target_label')
        .eq('user_id', userId)
        .eq('target_type', 'board')
        .limit(40);

    const boardIds = (follows || []).map((f) => f.target_id).filter(Boolean);
    if (!boardIds.length) return [];

    const { data: activity, error } = await supabase
        .from('board_activity')
        .select('id, board_id, actor_id, event_type, payload, created_at')
        .in('board_id', boardIds)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('getFollowedBoardActivity:', error);
        return [];
    }

    const { data: boards } = await supabase
        .from('boards')
        .select('id, title, slug, cover_image, user_id, is_public')
        .in('id', boardIds)
        .eq('is_public', true);

    const boardMap = new Map((boards || []).map((b) => [b.id, b]));
    const ownerIds = [...new Set((boards || []).map((b) => b.user_id))];
    let profileMap = new Map();
    if (ownerIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', ownerIds);
        profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    return (activity || [])
        .map((a) => {
            const board = boardMap.get(a.board_id);
            if (!board) return null;
            return {
                ...a,
                board: {
                    ...board,
                    user_profiles: profileMap.get(board.user_id) || null,
                },
            };
        })
        .filter(Boolean);
}

export async function searchPublicBoards(query, limit = 20) {
    if (!query || query.length < 2) return [];
    const { data, error } = await supabase
        .from('boards')
        .select('id, title, slug, description, user_id, cover_image, items_count, likes_count, created_at')
        .eq('is_public', true)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('likes_count', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('searchPublicBoards:', error);
        return [];
    }

    const userIds = [...new Set((data || []).map((b) => b.user_id))];
    let profileMap = new Map();
    if (userIds.length) {
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('id, username, display_name')
            .in('id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    return (data || []).map((b) => ({
        ...b,
        owner: profileMap.get(b.user_id) || null,
    }));
}

export function itemHref(item) {
    if (!item) return '#';
    if (item.item_type === 'tv') return `/tv/${item.item_id}`;
    if (item.item_type === 'movie') return `/movies/${item.item_id}`;
    if (item.item_type === 'still') {
        const m = String(item.item_id || '').match(/^(movie|tv):(\d+)/);
        if (m) return m[1] === 'tv' ? `/tv/${m[2]}` : `/movies/${m[2]}`;
    }
    if (item.item_type === 'image') return '#';
    return `/search?q=${encodeURIComponent(item.title || '')}&tab=people`;
}

export function itemImageUrl(imageURL, item) {
    if (!item?.image_path) return null;
    if (item.image_path.startsWith('http') || item.image_path.startsWith('data:')) {
        return item.image_path;
    }
    const isWide = item.item_type === 'still' || item.item_type === 'image';
    const size = item.item_type === 'director' || item.item_type === 'actor'
        ? 'w185'
        : isWide
            ? 'w500'
            : 'w185';
    const path = item.image_path.startsWith('/') ? item.image_path : `/${item.image_path}`;
    // Always use the size matched to item type — ignore Redux /original base
    return `https://image.tmdb.org/t/p/${size}${path}`;
}

/** Build a unique still item_id so multiple stills from one title can coexist. */
export function stillItemId(mediaType, tmdbId, filePath) {
    const type = mediaType === 'tv' ? 'tv' : 'movie';
    return `${type}:${tmdbId}:${filePath}`;
}
