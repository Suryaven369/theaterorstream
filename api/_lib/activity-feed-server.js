/**
 * Server-side activity_feed rows (service role), e.g. after collection likes.
 */
export async function recordCollectionLikeActivity(supabase, userId, collectionId) {
    if (!userId || !collectionId) return;

    const { data: col } = await supabase
        .from('user_collections')
        .select('id, name, user_id')
        .eq('id', collectionId)
        .maybeSingle();
    if (!col?.name) return;

    let ownerUsername = null;
    if (col.user_id) {
        const { data: owner } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', col.user_id)
            .maybeSingle();
        ownerUsername = owner?.username || null;
    }

    const { error } = await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'collection_like',
        payload: {
            collection_id: col.id,
            name: col.name,
            owner_username: ownerUsername,
        },
        visibility: 'public',
    });
    if (error) console.warn('collection_like -> activity_feed:', error.message);
}

export async function recordPostLikeActivityServer(supabase, userId, postId) {
    if (!userId || !postId) return;

    const { data: post } = await supabase
        .from('feed_posts')
        .select('id, post_type, content, movie_title, movie_poster, tmdb_id, media_type')
        .eq('id', postId)
        .maybeSingle();
    if (!post) return;

    const preview = (post.content || post.movie_title || '').trim().slice(0, 120);

    const { error } = await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'post_like',
        target_tmdb_id: post.tmdb_id ? String(post.tmdb_id) : null,
        target_movie_title: post.movie_title || preview || null,
        target_poster_path: post.movie_poster || null,
        media_type: post.media_type || 'movie',
        payload: {
            post_id: post.id,
            post_type: post.post_type,
            preview,
        },
        visibility: 'public',
    });
    if (error) console.warn('post_like -> activity_feed:', error.message);
}
