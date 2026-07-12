import { createClient } from '@supabase/supabase-js';

export const config = {
    matcher: [
        '/collection/:slug*',
        '/boards/:slug*',
        '/:username/boards/:slug*',
        '/blog/:id*',
        '/movies/:slug*',
        '/tv/:slug*',
        '/:username/profile',
        '/post/:id*',
        '/movie/:id*',
    ],
};

const SITE = 'https://www.theaterorstream.com';
const DEFAULT_OG_IMAGE =
    'https://res.cloudinary.com/ddhhlkyut/image/upload/v1768226006/a78a29523128c4555fdd178b6c612ac6_dbtyqp.jpg';

const CRAWLER_USER_AGENTS = [
    'facebookexternalhit',
    'Facebot',
    'Twitterbot',
    'WhatsApp',
    'LinkedInBot',
    'Pinterest',
    'Slackbot',
    'TelegramBot',
    'Discordbot',
    'Googlebot',
    'bingbot',
    'Baiduspider',
    'DuckDuckBot',
    'Yahoo! Slurp',
    'Embedly',
    'Quora Link Preview',
    'Showyoubot',
    'outbrain',
    'vkShare',
    'W3C_Validator',
    'redditbot',
    'Applebot',
    'Instagram',
];

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

/** Rewrite localhost/Vite-proxy storage URLs saved during local uploads. */
function toPublicStorageUrl(url) {
    if (!url || typeof url !== 'string') return url || null;
    const remote = String(supabaseUrl || '').replace(/\/$/, '');
    if (!remote) return url;
    const storagePath = url.match(/(\/storage\/v1\/object\/public\/.+)$/i);
    const isProxy =
        /\/supabase-proxy\/storage\//i.test(url)
        || (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)
            && /\/storage\/v1\/object\/public\//i.test(url));
    if (storagePath && isProxy) return `${remote}${storagePath[1]}`;
    return url;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function createSlug(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function extractIdFromSlug(slug) {
    if (!slug) return null;
    const match = String(slug).match(/-(\d+)$/);
    return match ? match[1] : null;
}

function tmdbImage(path, size = 'w1280') {
    if (!path) return null;
    if (String(path).startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
}

function ogHtml({ title, description, image, url, type = 'website', extra = '' }) {
    const safeTitle = escapeHtml(title);
    const safeDesc = escapeHtml(description || '');
    const img = image || DEFAULT_OG_IMAGE;
    const pageUrl = url;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} | TheaterOrStream</title>
  <meta name="description" content="${safeDesc}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:secure_url" content="${img}">
  <meta property="og:site_name" content="TheaterOrStream">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${pageUrl}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${img}">
  <link rel="canonical" href="${pageUrl}">
  ${extra}
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDesc}</p>
  <p><a href="${pageUrl}">Open on TheaterOrStream</a></p>
</body>
</html>`;
}

function htmlResponse(html) {
    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}

function getSupabase() {
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey);
}

async function handleMovie(supabase, pathname, pageUrl) {
    const parts = pathname.split('/').filter(Boolean);
    // /movies/:slug | /tv/:slug | /movie/:id
    let mediaType = 'movie';
    let tmdbId = null;

    if (parts[0] === 'movies' || parts[0] === 'tv') {
        mediaType = parts[0] === 'tv' ? 'tv' : 'movie';
        tmdbId = extractIdFromSlug(parts[1]) || parts[1];
    } else if (parts[0] === 'movie') {
        tmdbId = parts[1];
        mediaType = 'movie';
    }

    if (!tmdbId || !/^\d+$/.test(String(tmdbId))) return null;

    const { data: movie } = await supabase
        .from('movies_library')
        .select('tmdb_id, title, overview, poster_path, backdrop_path, media_type, release_date, first_air_date, vote_average')
        .eq('tmdb_id', String(tmdbId))
        .maybeSingle();

    if (!movie) return null;

    const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
    const title = year ? `${movie.title} (${year})` : movie.title;
    const description =
        (movie.overview || '').trim().slice(0, 200) ||
        `See ratings, streaming info, and whether to watch ${movie.title} in theaters or at home.`;
    const image =
        tmdbImage(movie.backdrop_path, 'w1280') ||
        tmdbImage(movie.poster_path, 'w780') ||
        DEFAULT_OG_IMAGE;

    const kind = (movie.media_type || mediaType) === 'tv' ? 'TV show' : 'movie';
    return ogHtml({
        title,
        description,
        image,
        url: pageUrl,
        type: 'video.movie',
        extra: `<meta property="og:video:type" content="${kind}">`,
    });
}

async function handleProfile(supabase, pathname, pageUrl) {
    const parts = pathname.split('/').filter(Boolean);
    // /:username/profile
    if (parts.length < 2 || parts[1] !== 'profile') return null;
    const username = parts[0];
    if (!username || ['admin', 'api', 'auth', 'collection', 'boards', 'blog', 'post', 'movies', 'tv', 'movie', 'tags', 'tag'].includes(username)) {
        return null;
    }

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('username, display_name, bio, avatar_url, avatar_id')
        .eq('username', username.toLowerCase())
        .maybeSingle();

    if (!profile) return null;

    const name = profile.display_name || profile.username;
    const title = `${name} (@${profile.username})`;
    const description =
        (profile.bio || '').trim().slice(0, 180) ||
        `Film taste, lists, and diary from @${profile.username} on TheaterOrStream.`;
    const image = toPublicStorageUrl(profile.avatar_url) || DEFAULT_OG_IMAGE;

    return ogHtml({ title, description, image, url: pageUrl, type: 'profile' });
}

async function handlePost(supabase, pathname, pageUrl) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'post' || !parts[1]) return null;
    const postId = parts[1];

    const { data: post } = await supabase
        .from('feed_posts')
        .select('id, content, image_url, movie_title, movie_poster, movie_backdrop, user_id, visibility')
        .eq('id', postId)
        .eq('visibility', 'public')
        .maybeSingle();

    if (!post) return null;

    let username = 'user';
    if (post.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username, display_name')
            .eq('id', post.user_id)
            .maybeSingle();
        username = profile?.username || 'user';
    }

    const plain = String(post.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const title = post.movie_title
        ? `${post.movie_title} — post by @${username}`
        : `Post by @${username}`;
    const description = plain.slice(0, 180) || `See this post from @${username} on TheaterOrStream.`;
    const image =
        toPublicStorageUrl(post.image_url) ||
        tmdbImage(post.movie_backdrop, 'w1280') ||
        tmdbImage(post.movie_poster, 'w780') ||
        DEFAULT_OG_IMAGE;

    return ogHtml({ title, description, image, url: pageUrl, type: 'article' });
}

async function handleBlog(supabase, pathname, pageUrl) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'blog' || !parts[1]) return null;
    const id = parts[1];

    const { data: blog } = await supabase
        .from('blog_posts')
        .select('title, content, cover_image')
        .eq('id', id)
        .eq('visibility', 'public')
        .maybeSingle();

    if (!blog) return null;

    const desc = String(blog.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
    const img = toPublicStorageUrl(blog.cover_image) || DEFAULT_OG_IMAGE;

    return ogHtml({
        title: blog.title,
        description: desc,
        image: img,
        url: pageUrl,
        type: 'article',
    });
}

async function handleCollection(supabase, pathname, pageUrl) {
    const parts = pathname.split('/').filter(Boolean);
    let slug = null;
    let ownerUsername = null;
    let isBoard = false;

    if (parts[0] === 'collection' && parts[1]) {
        slug = parts[1];
    } else if (parts[0] === 'boards' && parts[1]) {
        slug = parts[1];
        isBoard = true;
    } else if (parts[1] === 'boards' && parts[2]) {
        ownerUsername = parts[0];
        slug = parts[2];
        isBoard = true;
    }
    if (!slug) return null;

    if (isBoard) {
        let ownerId = null;
        if (ownerUsername) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('username', ownerUsername)
                .maybeSingle();
            if (!profile) return null;
            ownerId = profile.id;
        }

        let query = supabase
            .from('boards')
            .select('*, board_items(item_id, title, image_path, item_type)')
            .eq('is_public', true)
            .eq('slug', slug)
            .limit(1);
        if (ownerId) query = query.eq('user_id', ownerId);

        const { data: rows } = await query;
        const board = rows?.[0];
        if (!board) return null;

        let username = ownerUsername || 'user';
        if (board.user_id && !ownerUsername) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('id', board.user_id)
                .maybeSingle();
            username = profile?.username || 'user';
        }

        const items = board.board_items || [];
        const img = toPublicStorageUrl(board.banner_image)
            || toPublicStorageUrl(board.cover_image)
            || (items[0]?.image_path ? tmdbImage(items[0].image_path, 'w780') : null)
            || DEFAULT_OG_IMAGE;

        return ogHtml({
            title: `${board.title} · Board`,
            description: board.description || `A cinematic board of ${board.items_count || items.length} titles by @${username}`,
            image: img,
            url: pageUrl,
            type: 'website',
        });
    }

    // Legacy user lists (collections)
    const { data: collections, error } = await supabase
        .from('user_collections')
        .select(`
            *,
            collection_movies (
              movie_id,
              movie_title,
              poster_path,
              media_type
            )
        `)
        .eq('is_public', true);

    if (error || !collections) return null;

    const collection = collections.find((c) => createSlug(c.name) === slug);
    if (!collection) return null;

    let username = 'user';
    if (collection.user_id) {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', collection.user_id)
            .maybeSingle();
        username = profile?.username || 'user';
    }

    const movies = collection.collection_movies || [];
    const movieCount = movies.length;
    const posterPaths = movies
        .slice(0, 4)
        .filter((m) => m.poster_path)
        .map((m) => m.poster_path);

    const ogImage =
        toPublicStorageUrl(collection.banner_image) ||
        toPublicStorageUrl(collection.cover_image) ||
        (posterPaths.length > 0 ? tmdbImage(posterPaths[0], 'w780') : null) ||
        DEFAULT_OG_IMAGE;

    const description =
        collection.meta_description ||
        collection.description ||
        `A curated collection of ${movieCount} ${movieCount === 1 ? 'title' : 'titles'} by @${username}`;
    const title = collection.meta_title || collection.name;
    const keywords = collection.keywords || '';

    return ogHtml({
        title,
        description,
        image: ogImage,
        url: pageUrl,
        type: 'website',
        extra: keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : '',
    });
}

export default async function middleware(request) {
    const userAgent = request.headers.get('user-agent') || '';
    const url = new URL(request.url);

    const isCrawler = CRAWLER_USER_AGENTS.some((agent) =>
        userAgent.toLowerCase().includes(agent.toLowerCase()),
    );

    if (!isCrawler) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const pathname = url.pathname;
    // Prefer www canonical for shared links
    const pageUrl = `${SITE}${pathname}${url.search}`;

    try {
        let html = null;

        if (pathname.startsWith('/movies/') || pathname.startsWith('/tv/') || pathname.startsWith('/movie/')) {
            html = await handleMovie(supabase, pathname, pageUrl);
        } else if (pathname.endsWith('/profile') || /\/[^/]+\/profile\/?$/.test(pathname)) {
            html = await handleProfile(supabase, pathname, pageUrl);
        } else if (pathname.startsWith('/post/')) {
            html = await handlePost(supabase, pathname, pageUrl);
        } else if (pathname.startsWith('/blog/')) {
            html = await handleBlog(supabase, pathname, pageUrl);
        } else if (
            pathname.startsWith('/collection/') ||
            pathname.startsWith('/boards/') ||
            /\/[^/]+\/boards\/[^/]+\/?$/.test(pathname)
        ) {
            html = await handleCollection(supabase, pathname, pageUrl);
        }

        if (html) return htmlResponse(html);
    } catch (err) {
        console.error('OG middleware error:', err);
    }

    return;
}
