import { createClient } from '@supabase/supabase-js';
import { generateJson, isLlmEnabled } from '../_lib/llm-server.js';

export const config = {
    runtime: 'edge',
};

function getSupabase() {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing Supabase env');
    return createClient(url, key);
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
    });
}

function getSegments(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('hashtags');
    return idx >= 0 ? parts.slice(idx + 1) : [];
}

async function loadTag(supabase, slug) {
    const normalized = String(slug || '').replace(/^#/, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
    if (!normalized) return null;
    const { data } = await supabase.from('hashtags').select('*').eq('slug', normalized).maybeSingle();
    return data;
}

async function relatedForTag(supabase, tag, limit) {
    if (!tag) return [];

    const { data: co } = await supabase.rpc('related_hashtags_by_cooccurrence', {
        p_hashtag_id: tag.id,
        p_limit: limit,
    });
    if (co?.length) return co;

    const slugs = Array.isArray(tag.related_slugs) ? tag.related_slugs.filter(Boolean) : [];
    if (slugs.length) {
        const { data } = await supabase
            .from('hashtags')
            .select('id, slug, display_name, category, posts_count, followers_count')
            .in('slug', slugs)
            .limit(limit);
        if (data?.length) return data;
    }

    const { data: same } = await supabase
        .from('hashtags')
        .select('id, slug, display_name, category, posts_count, followers_count')
        .eq('category', tag.category || 'general')
        .neq('slug', tag.slug)
        .order('trending_score', { ascending: false })
        .limit(limit);
    return same || [];
}

async function aiEnrichRelated(tag, existing, limit) {
    if (!isLlmEnabled()) return existing;
    try {
        const prompt = `You suggest related cinema hashtags for TheaterOrStream.
Given the hashtag #${tag.display_name} (category: ${tag.category}), suggest up to ${limit} related hashtags focused on movies/TV (genres, directors, actors, moods, franchises).
Return JSON: { "tags": [ { "slug": "scifi", "display_name": "SciFi" } ] }
Prefer existing cinema culture tags. No spaces in slug.`;

        const out = await generateJson(prompt, { maxTokens: 400 });
        const suggested = Array.isArray(out?.tags) ? out.tags : [];
        if (!suggested.length) return existing;

        const seen = new Set(existing.map((t) => t.slug));
        const merged = [...existing];
        for (const s of suggested) {
            const slug = String(s.slug || s.display_name || '')
                .replace(/^#/, '')
                .replace(/[^a-zA-Z0-9]+/g, '')
                .toLowerCase();
            if (!slug || slug === tag.slug || seen.has(slug)) continue;
            seen.add(slug);
            merged.push({
                slug,
                display_name: s.display_name || slug,
                category: 'general',
                posts_count: 0,
                followers_count: 0,
                ai: true,
            });
            if (merged.length >= limit) break;
        }
        return merged.slice(0, limit);
    } catch {
        return existing;
    }
}

export default async function handler(request) {
    if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        const url = new URL(request.url);
        const segments = getSegments(request);
        const action = segments[0] || 'analytics';
        const supabase = getSupabase();

        if (action === 'analytics') {
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '12', 10), 30);
            const { data, error } = await supabase.rpc('hashtag_analytics_bundle', { p_limit: limit });
            if (error) {
                const { data: week } = await supabase
                    .from('hashtags')
                    .select('id, slug, display_name, category, posts_count, followers_count, weekly_growth, trending_score')
                    .order('trending_score', { ascending: false })
                    .limit(limit);
                return json({
                    data: {
                        today: week || [],
                        week: week || [],
                        rising: (week || []).filter((t) => (t.weekly_growth || 0) > 0),
                        most_followed: week || [],
                    },
                });
            }
            return json({ data });
        }

        if (action === 'related') {
            const slug = url.searchParams.get('slug') || segments[1];
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '8', 10), 16);
            const tag = await loadTag(supabase, slug);
            if (!tag) return json({ data: [] });
            let related = await relatedForTag(supabase, tag, limit);
            related = await aiEnrichRelated(tag, related, limit);
            return json({ data: related, tag: { slug: tag.slug, display_name: tag.display_name } });
        }

        return json({ error: 'Unknown route' }, 404);
    } catch (err) {
        return json({ error: err.message || 'Server error' }, 500);
    }
}
