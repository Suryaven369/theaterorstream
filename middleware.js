import { createClient } from '@supabase/supabase-js';

export const config = {
    matcher: '/collection/:slug*',
};

// Social media and crawler user agents
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
];

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function middleware(request) {
    const userAgent = request.headers.get('user-agent') || '';
    const url = new URL(request.url);

    // Check if request is from a crawler/social media bot
    const isCrawler = CRAWLER_USER_AGENTS.some(agent =>
        userAgent.toLowerCase().includes(agent.toLowerCase())
    );

    // If not a crawler, let the SPA handle it
    if (!isCrawler) {
        return;
    }

    // Extract slug from URL
    const pathParts = url.pathname.split('/');
    const slug = pathParts[pathParts.length - 1];

    if (!slug || !supabaseUrl || !supabaseKey) {
        return;
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Helper to create slug from name (same as frontend)
        const createSlug = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
        };

        // Fetch all public collections (we need to match by slugified name)
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

        if (error || !collections) {
            return; // Let SPA handle it
        }

        // Find collection where slugified name matches
        const collection = collections.find(c => createSlug(c.name) === slug);

        if (!collection) {
            return; // Let SPA handle 404
        }

        // Fetch user profile
        let username = 'user';
        if (collection.user_id) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('id', collection.user_id)
                .single();
            username = profile?.username || 'user';
        }

        const movies = collection.collection_movies || [];
        const movieCount = movies.length;

        // Get first 4 movie posters for the OG image
        const posterPaths = movies
            .slice(0, 4)
            .filter(m => m.poster_path)
            .map(m => m.poster_path);

        // Use custom cover_image if set, otherwise first movie poster
        const ogImage = collection.cover_image
            || (posterPaths.length > 0 ? `https://image.tmdb.org/t/p/w780${posterPaths[0]}` : null)
            || 'https://www.theaterorstream.com/og-default.jpg';

        // Use custom meta_description if set, otherwise fallback
        const description = collection.meta_description
            || collection.description
            || `A curated collection of ${movieCount} ${movieCount === 1 ? 'movie' : 'movies'} by @${username}`;

        // Use custom meta_title if set, otherwise collection name
        const title = collection.meta_title || collection.name;

        // Keywords for meta tag
        const keywords = collection.keywords || '';

        // Generate HTML with proper OG meta tags
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  
  <!-- Primary Meta Tags -->
  <title>${escapeHtml(title)} | TheaterOrStream</title>
  <meta name="title" content="${escapeHtml(title)} | TheaterOrStream">
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url.href}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="780">
  <meta property="og:image:height" content="1170">
  <meta property="og:site_name" content="TheaterOrStream">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${url.href}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage}">
  
  <!-- Additional Meta -->
  <meta property="og:locale" content="en_US">
  <meta name="author" content="@${escapeHtml(username)}">
  <link rel="canonical" href="${url.href}">
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  
  <!-- Redirect to actual page for crawlers that follow redirects -->
  <meta http-equiv="refresh" content="0;url=${url.href}">
</head>
<body>
  <h1>${escapeHtml(collection.name)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>Collection by @${escapeHtml(username)} • ${movieCount} movies</p>
  <p><a href="${url.href}">View on TheaterOrStream</a></p>
  ${movies.slice(0, 10).map(m => `<p>🎬 ${escapeHtml(m.movie_title)}</p>`).join('\n  ')}
</body>
</html>`;

        return new Response(html, {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });

    } catch (err) {
        console.error('Middleware error:', err);
        return; // Let SPA handle it
    }
}

// Helper to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
