import { supabase } from './supabaseClient.js';
import { normalizeHashtagSlug } from './hashtags.js';

export async function searchHashtags(query, { limit = 8 } = {}) {
  const q = normalizeHashtagSlug(query);
  if (!q) {
    const { data, error } = await supabase
      .from('hashtags')
      .select('id, slug, display_name, category, posts_count, followers_count, trending_score')
      .order('trending_score', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[searchHashtags]', error.message);
      return [];
    }
    return data || [];
  }

  const { data, error } = await supabase
    .from('hashtags')
    .select('id, slug, display_name, category, posts_count, followers_count, trending_score')
    .or(`slug.ilike.${q}%,display_name.ilike.%${query.replace(/^#/, '')}%`)
    .order('trending_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[searchHashtags]', error.message);
    return [];
  }
  return data || [];
}

export async function getHashtagBySlug(slug) {
  const normalized = normalizeHashtagSlug(slug);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('hashtags')
    .select('*')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) {
    console.warn('[getHashtagBySlug]', error.message);
    return null;
  }
  return data;
}

export async function getTrendingHashtags({ limit = 20, category = null } = {}) {
  let query = supabase
    .from('hashtags')
    .select('id, slug, display_name, category, posts_count, followers_count, trending_score, weekly_growth, description')
    .order('trending_score', { ascending: false })
    .limit(limit);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    console.warn('[getTrendingHashtags]', error.message);
    return [];
  }
  return data || [];
}

export async function getHashtagsByCategory(category, { limit = 40 } = {}) {
  const { data, error } = await supabase
    .from('hashtags')
    .select('id, slug, display_name, category, posts_count, followers_count, trending_score')
    .eq('category', category)
    .order('posts_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[getHashtagsByCategory]', error.message);
    return [];
  }
  return data || [];
}

export async function getRelatedHashtags(tag, { limit = 8 } = {}) {
  if (!tag?.id && !tag?.slug) return [];

  // 1) Co-occurrence from shared posts/reviews
  if (tag.id) {
    const { data: co, error } = await supabase.rpc('related_hashtags_by_cooccurrence', {
      p_hashtag_id: tag.id,
      p_limit: limit,
    });
    if (!error && co?.length) return co;
  }

  // 2) Seeded related_slugs
  const slugs = Array.isArray(tag.related_slugs) ? tag.related_slugs.filter(Boolean) : [];
  if (slugs.length) {
    const { data } = await supabase
      .from('hashtags')
      .select('id, slug, display_name, category, posts_count, followers_count')
      .in('slug', slugs)
      .limit(limit);
    if (data?.length) return data;
  }

  // 3) Same category by trending
  return getTrendingHashtags({ limit: limit + 2, category: tag.category || null }).then((rows) =>
    rows.filter((r) => r.slug !== tag.slug).slice(0, limit),
  );
}

export async function getHashtagAnalytics(limit = 12) {
  const { data, error } = await supabase.rpc('hashtag_analytics_bundle', { p_limit: limit });
  if (error) {
    console.warn('[getHashtagAnalytics]', error.message);
    // Client fallback if RPC not migrated yet
    const [week, mostFollowed] = await Promise.all([
      getTrendingHashtags({ limit }),
      supabase
        .from('hashtags')
        .select('id, slug, display_name, category, posts_count, followers_count')
        .order('followers_count', { ascending: false })
        .limit(limit)
        .then((r) => r.data || []),
    ]);
    return {
      today: week.slice(0, limit),
      week,
      rising: week.filter((t) => (t.weekly_growth || 0) > 0).slice(0, limit),
      most_followed: mostFollowed,
    };
  }
  return {
    today: data?.today || [],
    week: data?.week || [],
    rising: data?.rising || [],
    most_followed: data?.most_followed || [],
  };
}

/** Post IDs that use any of the hashtags this user follows. */
export async function getFollowedHashtagPostIds(userId, { limit = 80 } = {}) {
  if (!userId) return [];
  const { data: follows } = await supabase
    .from('hashtag_follows')
    .select('hashtag_id')
    .eq('user_id', userId);
  const tagIds = (follows || []).map((f) => f.hashtag_id).filter(Boolean);
  if (!tagIds.length) return [];

  const { data: links } = await supabase
    .from('content_hashtags')
    .select('content_id, created_at')
    .eq('content_type', 'post')
    .in('hashtag_id', tagIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  return [...new Set((links || []).map((l) => l.content_id).filter(Boolean))];
}

/** Suggest related tags via API (co-occurrence + optional LLM). */
export async function suggestRelatedHashtags(slug, { limit = 8 } = {}) {
  try {
    const res = await fetch(`/api/hashtags/related?slug=${encodeURIComponent(slug)}&limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    return payload.data || [];
  } catch {
    const tag = await getHashtagBySlug(slug);
    return getRelatedHashtags(tag, { limit });
  }
}

export async function getHashtagPosts(hashtagId, { limit = 30, offset = 0 } = {}) {
  const { data: links, error } = await supabase
    .from('content_hashtags')
    .select('content_id, content_type, created_at')
    .eq('hashtag_id', hashtagId)
    .eq('content_type', 'post')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !links?.length) return [];

  const ids = links.map((l) => l.content_id);
  const { data: posts, error: postErr } = await supabase
    .from('feed_posts')
    .select(`
      id, user_id, content, post_type, tmdb_id, movie_title, movie_poster, media_type,
      likes_count, comments_count, image_url, created_at, visibility
    `)
    .in('id', ids)
    .eq('visibility', 'public');

  if (postErr) {
    console.warn('[getHashtagPosts]', postErr.message);
    return [];
  }

  const authorIds = [...new Set((posts || []).map((p) => p.user_id).filter(Boolean))];
  let profilesById = {};
  if (authorIds.length) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', authorIds);
    profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  }

  const byId = new Map(
    (posts || []).map((p) => [p.id, { ...p, user_profiles: profilesById[p.user_id] || null }]),
  );
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function isFollowingHashtag(userId, hashtagId) {
  if (!userId || !hashtagId) return false;
  const { data } = await supabase
    .from('hashtag_follows')
    .select('hashtag_id')
    .eq('user_id', userId)
    .eq('hashtag_id', hashtagId)
    .maybeSingle();
  return !!data;
}

export async function followHashtag(userId, hashtagId) {
  if (!userId || !hashtagId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('hashtag_follows')
    .upsert({ user_id: userId, hashtag_id: hashtagId }, { onConflict: 'user_id,hashtag_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unfollowHashtag(userId, hashtagId) {
  if (!userId || !hashtagId) return { ok: false, error: 'missing' };
  const { error } = await supabase
    .from('hashtag_follows')
    .delete()
    .eq('user_id', userId)
    .eq('hashtag_id', hashtagId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getUserFollowedHashtags(userId, { limit = 40 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('hashtag_follows')
    .select('created_at, hashtags ( id, slug, display_name, category, posts_count, followers_count )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[getUserFollowedHashtags]', error.message);
    return [];
  }
  return (data || []).map((row) => row.hashtags).filter(Boolean);
}

/** Most-used hashtags by a user (from content they authored). */
export async function getUserTopHashtags(userId, { limit = 12 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('content_hashtags')
    .select('hashtag_id, hashtags ( id, slug, display_name, category, posts_count )')
    .eq('user_id', userId)
    .limit(200);

  if (error || !data?.length) return [];

  const counts = new Map();
  for (const row of data) {
    const tag = row.hashtags;
    if (!tag?.id) continue;
    const prev = counts.get(tag.id) || { tag, count: 0 };
    prev.count += 1;
    counts.set(tag.id, prev);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ tag, count }) => ({ ...tag, use_count: count }));
}

/** Ensure tags exist client-side (fallback if DB trigger not yet applied). */
export async function ensureHashtagsFromContent(content, { contentType, contentId, userId } = {}) {
  if (!contentId || !contentType) return;
  try {
    await supabase.rpc('sync_content_hashtags', {
      p_content: content || '',
      p_content_type: contentType,
      p_content_id: contentId,
      p_user_id: userId || null,
    });
  } catch (err) {
    console.warn('[ensureHashtagsFromContent]', err.message);
  }
}
