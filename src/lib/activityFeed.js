import { supabase } from './supabase';
import { generateSlugWithId } from './slugUtils';
import { threadPathForItem } from './feedThread';
import { feedLikeSubject } from './feedLikes';

function listSlug(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

export function activityVerb(type) {
    return ({
        log: 'Watched',
        watched: 'Watched',
        review: 'Reviewed',
        rating: 'Rated',
        rated: 'Rated',
        like: 'Liked',
        watchlist: 'Added to watchlist',
        list_created: 'Created a list',
        blog_post: 'Published a blog',
        badge: 'Earned a badge',
        decision_pick: 'Picked for tonight',
        board_created: 'Created a board',
        post_like: 'Liked a post',
        post_comment: 'Commented on a post',
        feed_like: 'Liked',
        collection_like: 'Liked a list',
        follow: 'Followed',
    }[type] || (type ? String(type).replace(/_/g, ' ') : 'Activity'));
}

function moviePath(activity) {
    if (!activity?.target_tmdb_id || !activity?.target_movie_title) return null;
    const slug = generateSlugWithId(activity.target_movie_title, activity.target_tmdb_id);
    return activity.media_type === 'tv' ? `/tv/${slug}` : `/movies/${slug}`;
}

function posterFromActivity(activity) {
    const path = activity?.target_poster_path;
    if (!path) return null;
    return path.startsWith('http') ? path : `https://image.tmdb.org/t/p/w92${path}`;
}

/**
 * Human-readable target + link for a single activity_feed row.
 */
export function resolveActivityDisplay(activity, { profileUsername } = {}) {
    const p = activity?.payload || {};
    const verb = activityVerb(activity?.event_type);
    let href = null;
    let title = null;
    let subline = null;
    let posterSrc = posterFromActivity(activity);

    switch (activity?.event_type) {
        case 'log':
            title = activity.target_movie_title;
            href = moviePath(activity);
            if (p.rating != null) subline = `Rated ${p.rating}/10`;
            if (p.watched_in_theater) subline = [subline, '🍿 In theater'].filter(Boolean).join(' · ');
            break;
        case 'rating':
            title = activity.target_movie_title;
            href = moviePath(activity);
            if (p.overall != null) subline = `TOS avg ${Number(p.overall).toFixed(1)}/10`;
            break;
        case 'like':
        case 'watchlist':
        case 'decision_pick':
            title = activity.target_movie_title;
            href = moviePath(activity);
            break;
        case 'review':
            title = p.title || activity.target_movie_title;
            href = moviePath(activity);
            break;
        case 'list_created':
            title = p.name || 'Untitled list';
            if (p.collection_id) {
                href = `/collection/${p.collection_id}${profileUsername ? `?u=${encodeURIComponent(profileUsername)}` : ''}`;
            } else if (p.name) {
                href = `/collection/${listSlug(p.name)}${profileUsername ? `?u=${encodeURIComponent(profileUsername)}` : ''}`;
            }
            if (p.description) subline = p.description;
            break;
        case 'blog_post':
            title = p.title || 'Blog post';
            if (p.blog_id) href = `/blog/${p.blog_id}`;
            if (p.excerpt) subline = p.excerpt;
            break;
        case 'badge':
            title = [p.icon, p.name].filter(Boolean).join(' ') || 'Badge';
            break;
        case 'board_created':
            title = p.title || 'Board';
            if (p.slug) href = `/boards/${p.slug}`;
            break;
        case 'post_like':
        case 'post_comment':
            title = activity.target_movie_title || p.post_title || p.preview || 'a post';
            href = p.thread_path || (p.post_id ? `/thread/post-${p.post_id}` : null);
            if (activity.event_type === 'post_comment' && p.preview) subline = p.preview;
            break;
        case 'feed_like': {
            const kind = p.feed_kind || 'item';
            title = p.title || activity.target_movie_title
                || ({ article: 'an article', tweet: 'a tweet', trailer: 'a trailer', comment: 'a comment' }[kind]
                    || 'something on the feed');
            href = p.thread_path || moviePath(activity);
            break;
        }
        case 'collection_like':
            title = p.name || 'a list';
            if (p.name) {
                const owner = p.owner_username ? `?u=${encodeURIComponent(p.owner_username)}` : '';
                href = `/collection/${listSlug(p.name)}${owner}`;
            }
            break;
        case 'follow':
            title = p.username ? `@${p.username}` : p.display_name || 'someone';
            if (p.username) href = `/${p.username}/profile`;
            break;
        default:
            title = activity.target_movie_title || p.title || p.name || null;
            href = moviePath(activity);
            break;
    }

    return { verb, title, href, posterSrc, subline };
}

export async function recordActivityFeed(row) {
    if (!row?.user_id || !row?.event_type) return;
    const { error } = await supabase.from('activity_feed').insert({
        payload: {},
        visibility: 'public',
        ...row,
    });
    if (error) console.warn('activity_feed insert:', error.message);
}

export async function recordPostLikeActivity(userId, postId) {
    if (!userId || !postId) return;
    const { data: post } = await supabase
        .from('feed_posts')
        .select('id, post_type, content, movie_title, movie_poster, tmdb_id, media_type')
        .eq('id', postId)
        .maybeSingle();
    if (!post) return;

    const preview = (post.content || post.movie_title || '').trim().slice(0, 120);
    const threadItem = {
        id: post.id,
        type: 'post',
        content: post.content,
        movieTitle: post.movie_title,
    };

    await recordActivityFeed({
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
            thread_path: threadPathForItem(threadItem),
        },
    });
}

export function recordFeedItemLikeActivity(userId, item) {
    if (!userId || !item) return;
    const subject = feedLikeSubject(item);
    if (!subject) return;

    const title = item.title || item.movieTitle || item.trailerName || item.headline
        || (item.content || '').trim().slice(0, 80) || null;

    const row = {
        user_id: userId,
        event_type: 'feed_like',
        payload: {
            feed_kind: subject.kind,
            subject_id: subject.id,
            title,
            thread_path: threadPathForItem(item),
        },
        visibility: 'public',
    };

    if (subject.kind === 'trailer' && (item.tmdb_id != null || subject.id)) {
        row.target_tmdb_id = String(item.tmdb_id ?? subject.id);
        row.target_movie_title = title;
        row.target_poster_path = item.poster || item.poster_path || null;
        row.media_type = item.media_type || 'movie';
    }

    recordActivityFeed(row);
}

export async function recordPostCommentActivity(userId, postId, commentText) {
    if (!userId || !postId) return;
    const { data: post } = await supabase
        .from('feed_posts')
        .select('id, content, movie_title, movie_poster, tmdb_id, media_type')
        .eq('id', postId)
        .maybeSingle();

    const preview = (commentText || '').trim().slice(0, 160);
    const threadItem = post ? {
        id: post.id,
        type: 'post',
        content: post.content,
        movieTitle: post.movie_title,
    } : { id: postId, type: 'post', content: '' };

    await recordActivityFeed({
        user_id: userId,
        event_type: 'post_comment',
        target_tmdb_id: post?.tmdb_id ? String(post.tmdb_id) : null,
        target_movie_title: post?.movie_title || null,
        target_poster_path: post?.movie_poster || null,
        media_type: post?.media_type || 'movie',
        payload: {
            post_id: postId,
            post_title: post?.movie_title || (post?.content || '').trim().slice(0, 80) || null,
            preview,
            thread_path: threadPathForItem(threadItem),
        },
    });
}

export async function recordFollowActivity(followerId, followingId) {
    if (!followerId || !followingId) return;
    const { data: prof } = await supabase
        .from('user_profiles')
        .select('username, display_name')
        .eq('id', followingId)
        .maybeSingle();

    await recordActivityFeed({
        user_id: followerId,
        event_type: 'follow',
        payload: {
            following_id: followingId,
            username: prof?.username || null,
            display_name: prof?.display_name || null,
        },
    });
}

export async function recordWatchlistActivity(userId, movieId, movieTitle, posterPath, mediaType = 'movie') {
    if (!userId) return;
    await recordActivityFeed({
        user_id: userId,
        event_type: 'watchlist',
        target_tmdb_id: String(movieId),
        target_movie_title: movieTitle,
        target_poster_path: posterPath || null,
        media_type: mediaType,
    });
}
