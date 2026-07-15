import * as cheerio from 'cheerio';
import https from 'node:https';
import http from 'node:http';
import { getSupabaseAdmin } from './supabase-admin.js';
import { fetchTmdbApi } from './tmdb-server.js';
import { analyzeArticle as analyzeArticleKeywords } from './news-keywords.js';

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Some sites (Nitter mirrors in particular) silently return an empty 200 body to
// undici's fetch() specifically — same URL, same headers, works fine via curl or
// a browser — almost certainly TLS/HTTP client fingerprinting rather than anything
// about our request content. Node's own https/http client uses a different stack
// and isn't affected, so feed/page fetching goes through this instead of fetch().
function httpGetText(targetUrl, { timeout = FETCH_TIMEOUT_MS, userAgent = DEFAULT_UA, accept, redirectsLeft = 5 } = {}) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(targetUrl);
        } catch {
            return reject(new Error(`Invalid URL: ${targetUrl}`));
        }

        const client = url.protocol === 'http:' ? http : https;
        const req = client.get(
            url,
            { headers: { 'User-Agent': userAgent, ...(accept ? { Accept: accept } : {}) }, timeout },
            (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
                    const nextUrl = new URL(res.headers.location, url).toString();
                    return resolve(httpGetText(nextUrl, { timeout, userAgent, accept, redirectsLeft: redirectsLeft - 1 }));
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    res.resume();
                    return reject(new Error(`Request failed (${res.statusCode})`));
                }
                let body = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve(body));
            },
        );
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.on('error', reject);
    });
}

function decodeEntities(text) {
    if (!text) return text;
    return cheerio.load(`<div>${text}</div>`)('div').text();
}

function firstNonEmpty(...values) {
    return values.find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

// Strip script/style/event-handler attributes from feed-supplied HTML before it's
// stored and later rendered on our own article page — feeds are admin-curated, but
// the HTML itself comes from a third party and shouldn't be trusted as-is.
function sanitizeArticleHtml(html) {
    if (!html) return null;
    const $ = cheerio.load(html, { decodeEntities: false });
    $('script, style, iframe, object, embed, form').remove();
    $('*').each((_, el) => {
        const attribs = el.attribs || {};
        Object.keys(attribs).forEach((attr) => {
            const value = attribs[attr];
            if (/^on/i.test(attr) || (attr === 'href' && /^\s*javascript:/i.test(value))) {
                delete el.attribs[attr];
            }
        });
    });
    return $.root().html() || null;
}

function extractImage(item, $item) {
    const mediaContent = $item.find('media\\:content, content').first().attr('url');
    if (mediaContent) return mediaContent;

    const mediaThumbnail = $item.find('media\\:thumbnail').first().attr('url');
    if (mediaThumbnail) return mediaThumbnail;

    const enclosure = $item.find('enclosure').first();
    if (enclosure.attr('url') && /^image\//.test(enclosure.attr('type') || '')) {
        return enclosure.attr('url');
    }

    const description = item.description || item.contentEncoded || '';
    const match = description.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

// Most news RSS feeds only publish a short excerpt (often ending in "…") rather than
// the complete story — fine for a feed card, not enough for a "read full article" page
// on our own site. These are candidate containers for the real article body, tried in
// order; whichever has the most paragraph text wins. Covers the common WordPress-family
// patterns (PMC's Variety/Deadline use "a-content", Valnet's /Film/ScreenRant/Collider
// use a plain <article>, most generic WP sites use "entry-content").
const CONTENT_SELECTORS = [
    '[itemprop="articleBody"]',
    'article .entry-content',
    '.entry-content',
    '.a-content',
    'article.news-post',
    '.article-content',
    '.article-body',
    '.post-content',
    'article',
];

// Elements that show up inside article bodies but aren't part of the story itself —
// ads, newsletter signups, related-post rails, share buttons, comment widgets, etc.
const CONTENT_CRUFT_SELECTOR =
    'script, style, iframe, object, embed, form, nav, aside, ' +
    '.cq-quiz, [class*="cq-quiz"], [class*="quiz-embed"], [id*="quiz"], ' +
    '[class*="ad-"], [class*="advert"], [class*="newsletter"], [class*="related"], ' +
    '[class*="share"], [class*="comment"], [class*="byline"], [class*="social"], [class*="tag"]';

const MIN_FULL_BODY_LENGTH = 300;

function pickArticleBodyElement($) {
    // Selectors are ordered most-specific to least-specific (bare "article" last) —
    // take the first one that has enough text, not the highest-scoring one. A broader
    // container always scores higher purely by including more surrounding cruft
    // (related posts, comments), so "highest score" would defeat the specific ones.
    for (const selector of CONTENT_SELECTORS) {
        const el = $(selector).first();
        if (!el.length) continue;
        const score = el.find('p').text().replace(/\s+/g, ' ').trim().length;
        if (score >= MIN_FULL_BODY_LENGTH) return el;
    }
    return null;
}

// Fetches the article's own page once and pulls out (a) the Open Graph image, used
// as a fallback when the RSS item gave us none, and (b) the full story body, used to
// replace the feed's truncated excerpt on our article-detail page.
async function fetchArticlePageData(pageUrl) {
    try {
        const html = await httpGetText(pageUrl, { timeout: 10000 });
        const $ = cheerio.load(html);

        const ogImage =
            $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            null;

        const bodyEl = pickArticleBodyElement($);
        let fullBodyHtml = null;
        if (bodyEl) {
            bodyEl.find(CONTENT_CRUFT_SELECTOR).remove();
            fullBodyHtml = sanitizeArticleHtml(bodyEl.html());
        }

        return { ogImage, fullBodyHtml };
    } catch {
        return { ogImage: null, fullBodyHtml: null };
    }
}

// Runs `fn` over `items` with at most `limit` in flight at once — full-page scraping
// is the slow part of a refresh, so this keeps it bounded instead of firing dozens of
// requests at a source (or hitting our own function's time limit) at once.
async function mapWithConcurrency(items, limit, fn) {
    const results = [];
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// Capped per refresh so a source's very first sync (up to 30 new items) can't blow
// past our serverless function's time budget. Since duplicates are skipped on later
// refreshes, anything left uncapped here keeps its feed-supplied excerpt for good —
// in practice this limit only bites on a source's first-ever fetch.
const MAX_FULL_BODY_FETCHES_PER_RUN = 15;
const FULL_BODY_CONCURRENCY = 4;

// News feeds give a short headline as the title; social feeds (e.g. Nitter's
// Twitter/X RSS) put the entire post — sometimes multi-line, sometimes 200+
// chars — into <title>. Collapse and cap it so it still reads as a card
// headline instead of a wall of text; the full text survives in the summary.
const MAX_TITLE_LENGTH = 140;
function toHeadline(rawTitle) {
    const collapsed = (rawTitle || '').replace(/\s+/g, ' ').trim();
    if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed;
    return `${collapsed.slice(0, MAX_TITLE_LENGTH - 1).trim()}…`;
}

function parseRssItem($, el) {
    const $item = $(el);
    const rawTitle = decodeEntities($item.find('title').first().text().trim());
    const link = $item.find('link').first().text().trim() || $item.find('link').first().attr('href') || '';
    const isTweet = /nitter\.|\/\/(?:www\.)?(?:twitter|x)\.com\b/i.test(link);
    const title = isTweet ? rawTitle.replace(/\s+/g, ' ').trim() : toHeadline(rawTitle);
    const guid = firstNonEmpty($item.find('guid').first().text().trim(), link);
    const author = decodeEntities(
        firstNonEmpty(
            $item.find('dc\\:creator').first().text().trim(),
            $item.find('author').first().text().trim(),
        ),
    );
    const pubDateRaw = firstNonEmpty(
        $item.find('pubDate').first().text().trim(),
        $item.find('published').first().text().trim(),
        $item.find('updated').first().text().trim(),
    );
    const description = $item.find('description').first().text().trim();
    const contentEncoded = $item.find('content\\:encoded').first().text().trim();

    const item = { title, link, guid, author, description, contentEncoded };
    const image = extractImage(item, $item);
    const bodyHtml = sanitizeArticleHtml(firstNonEmpty(contentEncoded, description));
    const summarySource = decodeEntities(firstNonEmpty(description, contentEncoded, rawTitle) || '');
    const summary = summarySource.replace(/\s+/g, ' ').trim().slice(0, isTweet ? 2000 : 400);

    return {
        title,
        link,
        guid: guid || link,
        author,
        summary,
        bodyHtml,
        imageUrl: image,
        publishedAt: pubDateRaw ? new Date(pubDateRaw).toISOString() : null,
    };
}

function parseAtomEntry($, el) {
    const $entry = $(el);
    const title = toHeadline(decodeEntities($entry.find('title').first().text().trim()));
    const linkEl = $entry.find('link[rel="alternate"]').first().length
        ? $entry.find('link[rel="alternate"]').first()
        : $entry.find('link').first();
    const link = linkEl.attr('href') || '';
    const guid = firstNonEmpty($entry.find('id').first().text().trim(), link);
    const author = decodeEntities($entry.find('author > name').first().text().trim());
    const pubDateRaw = firstNonEmpty(
        $entry.find('published').first().text().trim(),
        $entry.find('updated').first().text().trim(),
    );
    const contentHtml = firstNonEmpty(
        $entry.find('content').first().text().trim(),
        $entry.find('summary').first().text().trim(),
    );

    const bodyHtml = sanitizeArticleHtml(contentHtml);
    const summary = decodeEntities(contentHtml || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const imgMatch = (contentHtml || '').match(/<img[^>]+src=["']([^"']+)["']/i);

    return {
        title,
        link,
        guid: guid || link,
        author,
        summary,
        bodyHtml,
        imageUrl: imgMatch ? imgMatch[1] : null,
        publishedAt: pubDateRaw ? new Date(pubDateRaw).toISOString() : null,
    };
}

/**
 * Entertainment keywords for filtering Google Trends
 * Only trends matching these keywords will be imported
 */
const ENTERTAINMENT_KEYWORDS = [
    // Movies & Film
    'movie', 'film', 'cinema', 'trailer', 'sequel', 'prequel', 'remake', 'reboot',
    'box office', 'blockbuster', 'premiere', 'screening',
    // TV & Streaming
    'tv show', 'series', 'season', 'episode', 'finale', 'netflix', 'disney+', 'disney plus',
    'hbo', 'max', 'hulu', 'amazon prime', 'apple tv', 'peacock', 'paramount+',
    'streaming', 'binge', 'showrunner',
    // People
    'actor', 'actress', 'director', 'producer', 'writer', 'screenwriter', 'filmmaker',
    'cast', 'casting', 'star', 'starring',
    // Studios & Franchises
    'marvel', 'mcu', 'dc', 'dceu', 'warner bros', 'universal', 'paramount', 'sony pictures',
    'pixar', 'dreamworks', 'lionsgate', 'a24', 'blumhouse', 'lucasfilm',
    'star wars', 'avengers', 'spider-man', 'spiderman', 'batman', 'superman', 'james bond',
    'fast furious', 'jurassic', 'transformers', 'mission impossible', 'indiana jones',
    'harry potter', 'lord of the rings', 'game of thrones', 'stranger things',
    // Awards
    'oscar', 'academy award', 'emmy', 'golden globe', 'bafta', 'cannes', 'sundance',
    'venice film', 'toronto film', 'sag award', 'critics choice',
    // Genres
    'horror movie', 'comedy film', 'action movie', 'thriller', 'sci-fi', 'superhero',
    'animated', 'animation', 'documentary',
    // Bollywood & International
    'bollywood', 'tollywood', 'kollywood', 'hindi movie', 'tamil movie', 'telugu movie',
    'korean drama', 'k-drama', 'anime',
    // Industry terms
    'box office', 'opening weekend', 'release date', 'production', 'filming',
    'post-production', 'script', 'screenplay',
];

/**
 * Check if text contains entertainment-related keywords
 */
function isEntertainmentRelated(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return ENTERTAINMENT_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Parse Google Trends RSS format - extracts news items from the custom ht:news_item elements
 * Google Trends RSS structure:
 *   <item>
 *     <title>search term</title>
 *     <ht:approx_traffic>1000+</ht:approx_traffic>
 *     <ht:news_item>
 *       <ht:news_item_title>Actual headline</ht:news_item_title>
 *       <ht:news_item_url>https://...</ht:news_item_url>
 *       <ht:news_item_picture>https://...</ht:news_item_picture>
 *       <ht:news_item_source>Source Name</ht:news_item_source>
 *     </ht:news_item>
 *   </item>
 */
function parseGoogleTrendsItem($, itemEl, newsItemEl) {
    const $item = $(itemEl);
    const $news = $(newsItemEl);
    
    const trendTerm = decodeEntities($item.find('title').first().text().trim());
    const traffic = $item.find('ht\\:approx_traffic').text().trim();
    const pubDateRaw = $item.find('pubDate').first().text().trim();
    
    const title = decodeEntities($news.find('ht\\:news_item_title').text().trim());
    const link = $news.find('ht\\:news_item_url').text().trim();
    const imageUrl = $news.find('ht\\:news_item_picture').text().trim() || null;
    const sourceName = decodeEntities($news.find('ht\\:news_item_source').text().trim());
    
    if (!title || !link) return null;
    
    return {
        title: toHeadline(title),
        link,
        guid: link,
        author: sourceName || null,
        summary: `Trending: "${trendTerm}" (${traffic} searches). ${title}`,
        bodyHtml: null,
        imageUrl,
        publishedAt: pubDateRaw ? new Date(pubDateRaw).toISOString() : null,
        // Extra metadata for Google Trends
        _trendTerm: trendTerm,
        _traffic: traffic,
        _isGoogleTrends: true,
    };
}

function parseGoogleTrendsFeed($) {
    const articles = [];
    const items = $('item').toArray();
    let totalNewsItems = 0;
    let entertainmentMatches = 0;
    
    for (const itemEl of items) {
        const $item = $(itemEl);
        const trendTerm = $item.find('title').first().text().trim();
        const newsItems = $item.find('ht\\:news_item').toArray();
        
        for (const newsItemEl of newsItems) {
            totalNewsItems++;
            const $news = $(newsItemEl);
            const headline = $news.find('ht\\:news_item_title').text().trim();
            
            // Only include if trend term OR headline contains entertainment keywords
            if (!isEntertainmentRelated(trendTerm) && !isEntertainmentRelated(headline)) {
                continue; // Skip non-entertainment trends
            }
            
            entertainmentMatches++;
            const parsed = parseGoogleTrendsItem($, itemEl, newsItemEl);
            if (parsed) articles.push(parsed);
        }
    }
    
    console.log(`[rss] Google Trends: ${entertainmentMatches}/${totalNewsItems} items matched entertainment filter`);
    return articles;
}

export function parseFeedXml(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });

    // Detect Google Trends RSS by checking for the ht namespace or ht:news_item elements
    const isGoogleTrends = xml.includes('xmlns:ht="https://trends.google.com') || 
                           xml.includes('<ht:news_item>') ||
                           $('ht\\:news_item').length > 0;
    
    if (isGoogleTrends) {
        const trendArticles = parseGoogleTrendsFeed($);
        if (trendArticles.length > 0) {
            return trendArticles;
        }
    }

    const rssItems = $('item').toArray();
    if (rssItems.length) {
        return rssItems.map((el) => parseRssItem($, el)).filter((a) => a.title && a.link);
    }

    const atomEntries = $('entry').toArray();
    return atomEntries.map((el) => parseAtomEntry($, el)).filter((a) => a.title && a.link);
}

async function fetchFeedXml(feedUrl) {
    return httpGetText(feedUrl, {
        timeout: FETCH_TIMEOUT_MS,
        userAgent: 'TheaterOrStream/1.0 (+https://theaterorstream.com)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    });
}

// Google's favicon service gives a reliable small site icon for almost any domain
// without us having to scrape the page ourselves.
function deriveFaviconUrl(url) {
    try {
        const { hostname } = new URL(url);
        return `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
    } catch {
        return null;
    }
}

const isGenericFavicon = (logo) => !logo || /s2\/favicons/.test(logo);

// A recognisable source logo. For YouTube channel feeds that's the real channel
// avatar (e.g. the Warner Bros logo) from the channel page's og:image — far
// better than a generic YouTube favicon. Falls back to a favicon otherwise.
async function deriveSourceLogo(source) {
    const channelId = extractYouTubeChannelId(source.feed_url);
    if (channelId) {
        try {
            const html = await httpGetText(`https://www.youtube.com/channel/${channelId}`, { accept: 'text/html' });
            const m = html.match(/<meta property="og:image" content="([^"]+)"/)
                || html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
            if (m && /yt3\.googleusercontent/.test(m[1])) return m[1];
        } catch { /* fall through to favicon */ }
    }
    return deriveFaviconUrl(source.site_url || source.feed_url);
}

// Global keyword filters live in app_settings (key 'rss_filters'), so the admin
// sets them once per kind instead of on every source. Per-source keywords (if
// any legacy ones exist) are merged in as an extra layer.
async function loadGlobalRssFilters(supabase) {
    const fallback = {
        trailer: { include: ['trailer', 'teaser'], exclude: [] },
        article: { include: [], exclude: [] },
    };
    try {
        const { data } = await supabase
            .from('app_settings').select('value').eq('key', 'rss_filters').maybeSingle();
        const v = data?.value || {};
        return {
            trailer: {
                include: v.trailer?.include || fallback.trailer.include,
                exclude: v.trailer?.exclude || [],
            },
            article: {
                include: v.article?.include || [],
                exclude: v.article?.exclude || [],
            },
        };
    } catch {
        return fallback;
    }
}

// --- TMDB + YouTube hybrid: verify a trailer video against a real TMDB title ---

const TRAILER_PHRASE = /\b(official|final|red\s*band|new|extended|international|main|full)?\s*(teaser|trailer|first\s*look|sneak\s*peek|featurette|clip|promo|spot)\b/gi;

const cleanTitleSegment = (seg) => String(seg)
    .replace(TRAILER_PHRASE, ' ')
    .replace(/\bretrospective\b/gi, ' ')                     // "X - Tom Cruise Retrospective Trailer"
    .replace(/\(?\b(19|20)\d{2}\b\)?/g, ' ')                 // year
    .replace(/\b(HD|4K|2K|VOSTFR|VF|ITA|ENG|SUB)\b/gi, ' ')   // quality/lang
    // streamer / "in theaters" tails
    .replace(/\b(in theaters|now playing|coming soon|only in theaters|streaming|netflix|hbo ?max|disney\+?|prime video|max|hulu|paramount\+?|apple tv\+?|peacock|jiocinema|hotstar)\b.*$/gi, ' ')
    .replace(/[☀-➿]|[\u{1F000}-\u{1FAFF}]/gu, ' ')  // emojis/symbols
    .replace(/["'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Ordered candidate movie titles from a YouTube video title, MOST LIKELY FIRST.
// The movie name is almost always the FIRST segment, e.g.
//   "DIGGER - Tom Cruise Retrospective Trailer" -> "DIGGER" (not the longest part)
//   "Dune: Messiah | Official Trailer (2026)"   -> "Dune: Messiah"
// matchTmdbTitle tries each candidate in order, so a studio-prefixed title still
// resolves to the next segment.
export function extractMovieTitleCandidates(rawTitle) {
    if (!rawTitle) return [];
    // Split on separators, but NOT ":" (part of titles like "Dune: Messiah").
    const segments = rawTitle.split(/\s*[|–—]\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    const cands = segments.map(cleanTitleSegment).filter((s) => s.length >= 2);
    // Whole title (separators flattened) as a final fallback.
    const whole = cleanTitleSegment(rawTitle.replace(/\s*[|–—]\s*|\s+-\s+/g, ' '));
    if (whole.length >= 2) cands.push(whole);
    return [...new Set(cands)].slice(0, 4);
}

// Back-compat: best single candidate.
export function extractMovieTitle(rawTitle) {
    return extractMovieTitleCandidates(rawTitle)[0] || null;
}

// Extract an 11-char YouTube video id from any YouTube URL form. Returns null
// for non-YouTube links (e.g. Moviefone) — those can't be embedded/played.
export function extractYouTubeKey(url) {
    if (!url) return null;
    const s = String(url);
    const m = s.match(/[?&]v=([\w-]{11})/)
        || s.match(/youtu\.be\/([\w-]{11})/)
        || s.match(/youtube\.com\/embed\/([\w-]{11})/)
        || s.match(/youtube\.com\/shorts\/([\w-]{11})/);
    return m ? m[1] : null;
}

// Build a clean, display-ready trailer post from a TMDB match + the YouTube item.
// `active` = whether it goes live immediately (true for the real-time WebSub
// push) or stays hidden pending admin review (false for the RSS poll).
function buildTrailerPost(article, match, source, { active = true } = {}) {
    const ytId = extractYouTubeKey(article.link);
    return {
        is_active: active,
        tmdb_id: String(match.id),
        media_type: match.media_type || 'movie',
        title: match.title || match.name,
        poster_path: match.poster_path || null,
        backdrop_path: match.backdrop_path || null,
        release_date: match.release_date || match.first_air_date || null,
        overview: match.overview || null,
        vote_average: match.vote_average ?? null,
        youtube_key: ytId,
        trailer_name: article.title || null,
        trailer_type: /teaser/i.test(article.title || '') ? 'Teaser' : 'Trailer',
        trailer_url: article.link || null,
        source_name: source?.name || null,
        source_logo: source?.logo_url || null,
        published_at: article.publishedAt || null,
        updated_at: new Date().toISOString(),
    };
}

// Upsert clean posts, keeping the NEWEST trailer per (media_type, tmdb_id).
async function upsertTrailerPosts(supabase, rows) {
    if (!rows?.length) return;
    // Collapse dupes within this batch (same title, multiple trailers) to newest.
    const byKey = new Map();
    for (const r of rows) {
        const k = `${r.media_type}:${r.tmdb_id}`;
        const prev = byKey.get(k);
        if (!prev || new Date(r.published_at || 0) >= new Date(prev.published_at || 0)) byKey.set(k, r);
    }
    const finalRows = [...byKey.values()];

    // Don't let a new PENDING (inactive) trailer hide a movie that already has a
    // LIVE one — keep it live; the admin reviews the new one separately.
    const pendingKeys = finalRows.filter((r) => r.is_active === false);
    if (pendingKeys.length) {
        const { data: existing } = await supabase
            .from('trailer_posts')
            .select('media_type, tmdb_id, is_active')
            .in('tmdb_id', [...new Set(pendingKeys.map((r) => r.tmdb_id))]);
        const liveSet = new Set((existing || []).filter((e) => e.is_active).map((e) => `${e.media_type}:${e.tmdb_id}`));
        for (const r of finalRows) {
            if (r.is_active === false && liveSet.has(`${r.media_type}:${r.tmdb_id}`)) r.is_active = true;
        }
    }

    let { error } = await supabase
        .from('trailer_posts')
        .upsert(finalRows, { onConflict: 'media_type,tmdb_id' });
    // Gracefully degrade if the source_logo column hasn't been migrated yet.
    if (error && /source_logo/.test(error.message || '')) {
        const stripped = finalRows.map(({ source_logo, ...r }) => r);
        ({ error } = await supabase.from('trailer_posts').upsert(stripped, { onConflict: 'media_type,tmdb_id' }));
    }
    if (error) console.error('[rss] trailer_posts upsert failed:', error.message);
}

// Verify a YouTube video title against TMDB by trying each candidate title
// (first/most-likely first) until one matches. Returns the top movie/TV match.
async function matchTmdbTitle(rawTitle) {
    for (const candidate of extractMovieTitleCandidates(rawTitle)) {
        try {
            const data = await fetchTmdbApi('/search/multi', {
                query: candidate, include_adult: 'false', page: '1',
            });
            const match = (data?.results || [])
                .find((r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.title || r.name));
            if (match) return match;
        } catch { /* try next candidate */ }
    }
    return null;
}

export async function fetchAndStoreSource(source, globalFilters = null) {
    const supabase = getSupabaseAdmin();
    const result = { sourceId: source.id, name: source.name, fetched: 0, added: 0, candidates: [], error: null };

    // Backfill a logo for sources missing one — or upgrade a generic YouTube
    // favicon to the real channel avatar so each studio is recognisable.
    let logoUrl = source.logo_url;
    if (isGenericFavicon(logoUrl)) {
        const derived = await deriveSourceLogo(source);
        if (derived && derived !== logoUrl) {
            logoUrl = derived;
            await supabase.from('rss_sources').update({ logo_url: logoUrl }).eq('id', source.id);
            await supabase.from('feed_articles').update({ source_logo_url: logoUrl }).eq('source_id', source.id);
        }
    }

    try {
        const xml = await fetchFeedXml(source.feed_url);
        const parsed = parseFeedXml(xml);

        // A 200 response with zero parsed items almost always means the URL points
        // at an HTML page rather than an actual RSS/Atom feed (e.g. a profile page
        // instead of its /rss endpoint) — surface that instead of silently
        // "succeeding" with nothing, which otherwise looks identical to "no new
        // articles since last time".
        if (parsed.length === 0) {
            throw new Error('Feed returned 0 items — is this URL an actual RSS/Atom feed (not a profile/home page)?');
        }

        // Keyword filtering uses the GLOBAL filters for this source's kind (set
        // once by the admin), merged with any legacy per-source keywords. Matching
        // is case-insensitive over title + summary, applied BEFORE the 30-item cap
        // so a strict include list isn't starved by unrelated items at the top.
        const filters = globalFilters || await loadGlobalRssFilters(supabase);
        const kindFilter = filters[source.source_kind || 'article'] || { include: [], exclude: [] };
        const norm = (arr) => (arr || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
        const include = [...new Set([...norm(kindFilter.include), ...norm(source.include_keywords)])];
        const exclude = [...new Set([...norm(kindFilter.exclude), ...norm(source.exclude_keywords)])];
        const passesKeywords = (a) => {
            if (!include.length && !exclude.length) return true;
            const hay = `${a.title || ''} ${a.summary || ''}`.toLowerCase();
            if (include.length && !include.some((k) => hay.includes(k))) return false;
            if (exclude.length && exclude.some((k) => hay.includes(k))) return false;
            return true;
        };

        let articles = parsed.filter(passesKeywords).slice(0, 30);

        // TMDB + YouTube hybrid: for trailer sources, verify each NEW item is a
        // real TMDB title before saving (drops random/non-movie uploads and
        // attaches the matched tmdb_id so it can deep-link to the film). Only new
        // items are verified — existing ones already carry their match.
        if ((source.source_kind || 'article') === 'trailer') {
            const guids = articles.map((a) => a.guid);
            let existingGuids = new Set();
            if (guids.length) {
                const { data: rows } = await supabase
                    .from('feed_articles').select('guid').eq('source_id', source.id).in('guid', guids);
                existingGuids = new Set((rows || []).map((r) => r.guid));
            }
            const toVerify = articles.filter((a) => !existingGuids.has(a.guid));
            const verified = [];
            const postRows = [];
            await mapWithConcurrency(toVerify, 5, async (a) => {
                const match = await matchTmdbTitle(a.title);
                if (match) {
                    a.tmdbId = String(match.id);
                    a.mediaType = match.media_type;
                    // Prefer the TMDB poster when the feed gave us no thumbnail.
                    if (!a.imageUrl && match.backdrop_path) {
                        a.imageUrl = `https://image.tmdb.org/t/p/w780${match.backdrop_path}`;
                    }
                    verified.push(a);
                    // Only persist a feed POST when there's a real, playable
                    // YouTube trailer — non-YouTube sources (Moviefone etc.) are
                    // verified for the record but never become feed posts.
                    // RSS-polled trailers are saved INACTIVE (pending review); only
                    // the real-time WebSub push publishes live (see ingestYouTubeVideo).
                    const post = buildTrailerPost(a, match, source, { active: false });
                    if (post.youtube_key) postRows.push(post);
                }
            });
            // Persist the CLEAN, ready-to-display post (TMDB title/poster + the
            // trailer video) — this is what the public feed reads. Newest trailer
            // per title wins.
            await upsertTrailerPosts(supabase, postRows);
            // Only verified NEW trailers are inserted (existing ones are untouched).
            articles = verified;
        }

        result.fetched = articles.length;

        // Nothing new matched (keyword filter and/or TMDB verification) — valid,
        // not an error.
        if (articles.length === 0) {
            await supabase
                .from('rss_sources')
                .update({ last_fetched_at: new Date().toISOString(), last_fetch_error: null })
                .eq('id', source.id);
            return result;
        }

        const isTrailer = (source.source_kind || 'article') === 'trailer';

        // News articles: do NOT write to feed_articles until an admin approves.
        // Return candidates for the admin inbox; skip already-saved guids.
        if (!isTrailer) {
            const guids = articles.map((a) => a.guid).filter(Boolean);
            let existingGuids = new Set();
            if (guids.length) {
                const { data: rows } = await supabase
                    .from('feed_articles')
                    .select('guid')
                    .eq('source_id', source.id)
                    .in('guid', guids);
                existingGuids = new Set((rows || []).map((r) => r.guid));
            }

            const fresh = articles.filter((a) => a.guid && !existingGuids.has(a.guid));
            result.added = 0;
            result.candidates = fresh.map((article) => ({
                _candidate: true,
                id: `candidate:${source.id}:${article.guid}`,
                source_id: source.id,
                source_name: source.name,
                source_logo_url: logoUrl || null,
                guid: article.guid,
                title: article.title,
                link: article.link,
                author: article.author || null,
                summary: article.summary || null,
                body_html: article.bodyHtml || null,
                image_url: article.imageUrl || null,
                published_at: article.publishedAt || null,
                status: 'pending',
                is_active: true,
            }));

            await supabase
                .from('rss_sources')
                .update({ last_fetched_at: new Date().toISOString(), last_fetch_error: null })
                .eq('id', source.id);
            return result;
        }

        const records = articles.map((article) => {
            const rec = {
                source_id: source.id,
                source_name: source.name,
                source_logo_url: logoUrl || null,
                guid: article.guid,
                title: article.title,
                link: article.link,
                author: article.author || null,
                summary: article.summary || null,
                body_html: article.bodyHtml,
                image_url: article.imageUrl,
                published_at: article.publishedAt,
            };
            // Verified trailer from the RSS poll → PENDING admin review (its
            // trailer_post is saved inactive above). Only the real-time WebSub
            // push auto-publishes live.
            if (article.tmdbId) {
                rec.tmdb_id = article.tmdbId;
                rec.media_type = article.mediaType || null;
                rec.status = 'pending';
            }
            return rec;
        });

        // ignoreDuplicates means rows already in the DB (same source_id+guid) are
        // skipped rather than re-upserted — .select() then only returns the rows
        // that were genuinely just inserted, which is what "added" should count.
        const { data: inserted, error } = await supabase
            .from('feed_articles')
            .upsert(records, { onConflict: 'source_id,guid', ignoreDuplicates: true })
            .select('id, link, image_url, body_html');

        if (error) throw error;
        result.added = inserted?.length || 0;

        // For newly-added trailers, fill missing thumbnail when possible.
        const toEnrich = (inserted || []).slice(0, MAX_FULL_BODY_FETCHES_PER_RUN);
        await mapWithConcurrency(toEnrich, FULL_BODY_CONCURRENCY, async (row) => {
            const { ogImage, fullBodyHtml } = await fetchArticlePageData(row.link);
            const updates = {};
            if (!row.image_url && ogImage) updates.image_url = ogImage;
            if (fullBodyHtml && fullBodyHtml.length > (row.body_html?.length || 0)) {
                updates.body_html = fullBodyHtml;
            }
            if (Object.keys(updates).length) {
                await supabase.from('feed_articles').update(updates).eq('id', row.id);
            }
        });

        await supabase
            .from('rss_sources')
            .update({ last_fetched_at: new Date().toISOString(), last_fetch_error: null })
            .eq('id', source.id);
    } catch (error) {
        result.error = error.message || 'Fetch failed';
        await supabase
            .from('rss_sources')
            .update({ last_fetched_at: new Date().toISOString(), last_fetch_error: result.error })
            .eq('id', source.id);
    }

    return result;
}

export async function refreshAllRssSources({ force = false, recencyMinutes = 8 } = {}) {
    const supabase = getSupabaseAdmin();
    const { data: sources, error } = await supabase
        .from('rss_sources')
        .select('*')
        .eq('is_active', true);

    if (error) throw error;

    const all = sources || [];
    // Skip sources refreshed in the last few minutes — a re-click then only hits
    // genuinely-stale feeds (near-instant), while the daily cron still does them
    // all. `force` overrides. This is the big win with many (60+) sources.
    const cutoff = Date.now() - recencyMinutes * 60_000;
    const due = force
        ? all
        : all.filter((s) => !s.last_fetched_at || new Date(s.last_fetched_at).getTime() < cutoff);
    const skipped = all.length - due.length;

    const globalFilters = await loadGlobalRssFilters(supabase);
    // Refresh due sources in parallel (8 at a time) instead of one-by-one.
    const results = await mapWithConcurrency(
        due,
        8,
        (source) => fetchAndStoreSource(source, globalFilters),
    );
    return { sourcesProcessed: results.length, skipped, total: all.length, results };
}

export async function refreshRssSourceById(sourceId) {
    const supabase = getSupabaseAdmin();
    const { data: source, error } = await supabase
        .from('rss_sources')
        .select('*')
        .eq('id', sourceId)
        .single();
    if (error || !source) throw new Error('RSS source not found');
    return fetchAndStoreSource(source);
}

// =====================================================================
// WebSub (PubSubHubbub) — real-time PUSH for YouTube trailer channels.
// YouTube's hub POSTs the moment a channel uploads; we verify against TMDB
// and persist the clean post. No polling for "is there a new video yet".
// =====================================================================

const WEBSUB_HUB = 'https://pubsubhubbub.appspot.com/subscribe';

// Pull the channel id out of a YouTube feed URL (…?channel_id=UC… or /channel/UC…).
export function extractYouTubeChannelId(feedUrl) {
    if (!feedUrl) return null;
    const m = String(feedUrl).match(/channel_id=([\w-]+)/) || String(feedUrl).match(/\/channel\/([\w-]+)/);
    return m ? m[1] : null;
}

// Ingest ONE pushed YouTube upload: keyword-gate → TMDB verify → persist the
// clean trailer_posts row (+ a feed_articles record for the admin/audit view).
export async function ingestYouTubeVideo({ videoId, title, publishedAt, channelId, authorName }) {
    const supabase = getSupabaseAdmin();
    const out = { videoId, matched: false };
    if (!videoId || !title) return out;

    // Only trailers/teasers (the push delivers every upload from the channel).
    if (!/\b(trailer|teaser)\b/i.test(title)) return { ...out, skipped: 'not-a-trailer' };

    // Find the owning source so we can stamp the studio name (best-effort).
    let source = null;
    if (channelId) {
        const { data } = await supabase
            .from('rss_sources').select('*').ilike('feed_url', `%${channelId}%`).limit(1);
        source = data?.[0] || null;
    }

    const match = await matchTmdbTitle(title);
    if (!match) return { ...out, skipped: 'no-tmdb-match' };

    const link = `https://www.youtube.com/watch?v=${videoId}`;
    const article = { title, link, publishedAt: publishedAt || new Date().toISOString(), tmdbId: String(match.id), mediaType: match.media_type };

    // Persist the clean, display-ready post (what the public feed reads).
    await upsertTrailerPosts(supabase, [buildTrailerPost(article, match, source || { name: authorName })]);

    // Keep a feed_articles record too (admin Trailers space + dedup), if we
    // could attribute it to a source.
    if (source) {
        await supabase.from('feed_articles').upsert([{
            source_id: source.id,
            source_name: source.name,
            guid: videoId,
            title,
            link,
            published_at: article.publishedAt,
            tmdb_id: article.tmdbId,
            media_type: article.mediaType,
            status: 'approved',
        }], { onConflict: 'source_id,guid', ignoreDuplicates: true });
    }

    return { ...out, matched: true, tmdbId: article.tmdbId, title: match.title || match.name };
}

// Subscribe (or unsubscribe) every YouTube trailer source to the push hub.
// `callbackUrl` must be your public /api/websub endpoint. Leases expire, so this
// is also the renewal call (run it periodically — it renews, it does NOT poll).
export async function subscribeYouTubeSources({ callbackUrl, mode = 'subscribe', secret = process.env.WEBSUB_SECRET } = {}) {
    if (!callbackUrl) throw new Error('callbackUrl required (your public /api/websub URL)');
    const supabase = getSupabaseAdmin();
    const { data: sources } = await supabase
        .from('rss_sources').select('id, name, feed_url')
        .eq('is_active', true).eq('source_kind', 'trailer');

    const results = [];
    for (const s of sources || []) {
        const channelId = extractYouTubeChannelId(s.feed_url);
        if (!channelId) { results.push({ name: s.name, ok: false, reason: 'no channel_id in feed_url' }); continue; }
        const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
        const body = new URLSearchParams({
            'hub.callback': callbackUrl,
            'hub.topic': topic,
            'hub.mode': mode,
            'hub.verify': 'async',
            'hub.lease_seconds': '828000',
        });
        if (secret) body.set('hub.secret', secret);
        try {
            const res = await fetch(WEBSUB_HUB, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            results.push({ name: s.name, channelId, ok: res.status === 202 || res.status === 204, status: res.status });
        } catch (err) {
            results.push({ name: s.name, channelId, ok: false, reason: err.message });
        }
    }
    return { mode, callbackUrl, count: results.length, results };
}

function bodyNeedsEnrichment(bodyHtml) {
    const html = String(bodyHtml || '');
    if (html.length < 1200) return true;
    // Listicles need real headings from the article page, not the RSS excerpt.
    if (!/<h[2-4]\b/i.test(html)) return true;
    return false;
}

/**
 * Approve (or re-summarize) a feed article: fetch the full page when the stored
 * body is a thin RSS excerpt, then mint the non-AI feed summary (list titles etc).
 */
export async function approveFeedArticleWithSummary(articleId, { regenerateOnly = false } = {}) {
    const supabase = getSupabaseAdmin();
    const { data: article, error } = await supabase
        .from('feed_articles')
        .select('id, link, title, summary, body_html, image_url, tmdb_id, media_type, status')
        .eq('id', articleId)
        .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!article) return { success: false, error: 'Article not found' };

    return finalizeArticleApproval(supabase, article, { regenerateOnly });
}

/**
 * Insert a news RSS candidate into feed_articles only on approve (never on fetch).
 */
export async function approveFeedArticleCandidate(candidate) {
    const supabase = getSupabaseAdmin();
    if (!candidate?.guid || !candidate?.source_id || !candidate?.title) {
        return { success: false, error: 'Invalid candidate (need source_id, guid, title)' };
    }

    const { data: existing } = await supabase
        .from('feed_articles')
        .select('id, status')
        .eq('source_id', candidate.source_id)
        .eq('guid', candidate.guid)
        .maybeSingle();

    if (existing?.status === 'approved') {
        return { success: false, error: 'Article already approved' };
    }

    let articleId = existing?.id || null;
    if (!articleId) {
        const row = {
            source_id: candidate.source_id,
            source_name: candidate.source_name || null,
            source_logo_url: candidate.source_logo_url || null,
            guid: candidate.guid,
            title: candidate.title,
            link: candidate.link || null,
            author: candidate.author || null,
            summary: candidate.summary || null,
            body_html: candidate.body_html || null,
            image_url: candidate.image_url || null,
            published_at: candidate.published_at || null,
            status: 'pending',
            is_active: true,
        };
        const { data: inserted, error: insErr } = await supabase
            .from('feed_articles')
            .insert(row)
            .select('id, link, title, summary, body_html, image_url, tmdb_id, media_type, status')
            .single();
        if (insErr) return { success: false, error: insErr.message };
        articleId = inserted.id;
        return finalizeArticleApproval(supabase, inserted, { regenerateOnly: false });
    }

    const { data: article, error } = await supabase
        .from('feed_articles')
        .select('id, link, title, summary, body_html, image_url, tmdb_id, media_type, status')
        .eq('id', articleId)
        .maybeSingle();
    if (error || !article) return { success: false, error: error?.message || 'Article not found' };
    return finalizeArticleApproval(supabase, article, { regenerateOnly: false });
}

async function finalizeArticleApproval(supabase, article, { regenerateOnly = false } = {}) {
    let bodyHtml = article.body_html || '';
    const updates = {
        updated_at: new Date().toISOString(),
    };
    if (!regenerateOnly) updates.status = 'approved';

    // Run keyword analysis for news intelligence (non-blocking, best-effort)
    try {
        const keywordAnalysis = await analyzeArticleKeywords(
            article.title,
            article.summary || bodyHtml
        );
        updates.positive_keyword_score = keywordAnalysis.positiveScore;
        updates.negative_keyword_score = keywordAnalysis.negativeScore;
        
        // Log the analysis
        await supabase.from('news_processing_logs').insert({
            article_id: article.id,
            step: 'keyword_filter',
            status: 'success',
            message: keywordAnalysis.recommendation.reason,
            metadata_json: {
                positive_score: keywordAnalysis.positiveScore,
                negative_score: keywordAnalysis.negativeScore,
                action: keywordAnalysis.recommendation.action,
                confidence: keywordAnalysis.recommendation.confidence,
                matched_negative: keywordAnalysis.matchedNegative?.slice(0, 10) || [],
                matched_positive: keywordAnalysis.matchedPositive?.slice(0, 10) || [],
            },
        }).then(() => {}, () => {}); // Silent fail for logging
    } catch (kwErr) {
        console.warn('[rss] Keyword analysis failed (non-fatal):', kwErr.message);
    }

    const { isTwitterFeedArticle, extractTwitterHandle, normalizeTweetText } = await import('../../src/lib/twitterRss.js');
    if (isTwitterFeedArticle({ link: article.link, sourceName: article.source_name })) {
        const handle = extractTwitterHandle(article.link, article.source_name);
        const tweet = normalizeTweetText({
            title: article.title,
            summary: article.summary,
            bodyHtml,
            handle,
        });
        if (tweet) updates.summary = tweet;
        updates.summary_items = null;
        // Keep RSS media; do not scrape flaky Nitter HTML pages.
    } else {
        if (article.link && bodyNeedsEnrichment(bodyHtml)) {
            const { ogImage, fullBodyHtml } = await fetchArticlePageData(article.link);
            if (fullBodyHtml && fullBodyHtml.length > bodyHtml.length) {
                bodyHtml = fullBodyHtml;
                updates.body_html = fullBodyHtml;
            }
            if (!article.image_url && ogImage) {
                updates.image_url = ogImage;
            }
        }

        const { summarizeArticleForFeed, parseSummaryForDisplay, isListicleArticle, isReasonBasedListicle } = await import('../../src/lib/articleSummary.js');
        // If we have a full page body with headings, ignore prior RSS/quiz summary text.
        const useRssSummary = /<h[2-4]\b/i.test(bodyHtml) ? '' : (article.summary || '');
        
        // Debug logging for listicle detection
        const hasH2Headings = (bodyHtml.match(/<h[2-4]/gi) || []).length;
        const isListicle = isListicleArticle(article.title, bodyHtml);
        const isReasonBased = isReasonBasedListicle(article.title);
        console.log(`[rss] Article "${article.title.slice(0, 50)}...": h2-h4 count=${hasH2Headings}, isListicle=${isListicle}, isReasonBased=${isReasonBased}, bodyLen=${bodyHtml.length}`);
        
        const feedSummary = summarizeArticleForFeed({
            title: article.title,
            summary: useRssSummary,
            bodyHtml,
        });
        if (feedSummary) updates.summary = feedSummary;
        
        console.log(`[rss] Feed summary (first 200 chars): ${(feedSummary || '').slice(0, 200).replace(/\n/g, ' | ')}`);

        const parsed = parseSummaryForDisplay(feedSummary || '');
        console.log(`[rss] Parsed kind=${parsed.kind}, items=${parsed.items?.length || 0}`);
        
        if (parsed.kind === 'list' && parsed.items.length >= 2) {
            const { buildListicleSummaryItems } = await import('./listicle-media.js');
            const summaryItems = await buildListicleSummaryItems(parsed.items, bodyHtml);
            console.log(`[rss] Built ${summaryItems?.length || 0} summary items, images: ${summaryItems?.filter(i => i.imageUrl).length || 0}`);
            updates.summary_items = summaryItems;
        } else {
            updates.summary_items = null;
        }
    }

    const { error: upErr } = await supabase
        .from('feed_articles')
        .update(updates)
        .eq('id', article.id);

    if (upErr) {
        // Older DBs may not have summary_items yet — retry without it.
        if (/summary_items/i.test(upErr.message || '')) {
            delete updates.summary_items;
            const { error: retryErr } = await supabase
                .from('feed_articles')
                .update(updates)
                .eq('id', article.id);
            if (retryErr) return { success: false, error: retryErr.message };
        } else {
            return { success: false, error: upErr.message };
        }
    }

    if (article.tmdb_id && !regenerateOnly) {
        // Bump updated_at so the Home feed sorts this trailer to the top on approve.
        await supabase
            .from('trailer_posts')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('tmdb_id', String(article.tmdb_id))
            .eq('media_type', article.media_type || 'movie')
            .then(() => {}, () => {});
    }

    return {
        success: true,
        articleId: article.id,
        summary: updates.summary || null,
        summaryItems: updates.summary_items || null,
        enriched: Boolean(updates.body_html),
    };
}

