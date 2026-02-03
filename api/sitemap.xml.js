import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (using environment variables from Vercel)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    const baseUrl = 'https://www.theaterorstream.com';
    const today = new Date().toISOString().split('T')[0];

    // Static pages
    const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'daily' },
        { url: '/upcoming', priority: '0.9', changefreq: 'daily' },
        { url: '/coming-soon', priority: '0.9', changefreq: 'daily' },
        { url: '/tv-series', priority: '0.8', changefreq: 'daily' },
        { url: '/search', priority: '0.7', changefreq: 'weekly' },
    ];

    // Fetch public collections from Supabase
    let collections = [];
    try {
        const { data, error } = await supabase
            .from('collections')
            .select('slug, updated_at')
            .eq('is_public', true)
            .order('updated_at', { ascending: false });

        if (!error && data) {
            collections = data;
        }
    } catch (err) {
        console.error('Error fetching collections:', err);
    }

    // Fetch homepage sections for popular movies
    let movieSlugs = [];
    try {
        const { data: sections, error } = await supabase
            .from('homepage_sections')
            .select('movies_by_region')
            .eq('is_active', true);

        if (!error && sections) {
            // Extract unique movie slugs from all sections and regions
            const allMovies = new Set();
            sections.forEach(section => {
                if (section.movies_by_region) {
                    Object.values(section.movies_by_region).forEach(regionMovies => {
                        if (Array.isArray(regionMovies)) {
                            regionMovies.forEach(movie => {
                                if (movie.tmdb_id && movie.title) {
                                    // Generate slug: title-year-id
                                    const year = movie.release_date?.split('-')[0] || '';
                                    const titleSlug = movie.title
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, '-')
                                        .replace(/(^-|-$)/g, '');
                                    const slug = year ? `${titleSlug}-${year}-${movie.tmdb_id}` : `${titleSlug}-${movie.tmdb_id}`;
                                    const mediaType = movie.media_type === 'tv' ? 'tv' : 'movies';
                                    allMovies.add(`/${mediaType}/${slug}`);
                                }
                            });
                        }
                    });
                }
            });
            movieSlugs = Array.from(allMovies).slice(0, 500); // Limit to 500 for performance
        }
    } catch (err) {
        console.error('Error fetching movies:', err);
    }

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

    // Add static pages
    staticPages.forEach(page => {
        sitemap += `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    });

    // Add public collections
    collections.forEach(collection => {
        const lastmod = collection.updated_at
            ? new Date(collection.updated_at).toISOString().split('T')[0]
            : today;
        sitemap += `  <url>
    <loc>${baseUrl}/collection/${collection.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
    });

    // Add movie pages
    movieSlugs.forEach(moviePath => {
        sitemap += `  <url>
    <loc>${baseUrl}${moviePath}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
    });

    sitemap += `</urlset>`;

    return new Response(sitemap, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
    });
}
