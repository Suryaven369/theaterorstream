import { getSupabaseAdmin } from './supabase-admin.js';

const BADGE_CHECKS = {
    first_reel: async (supabase, userId) => {
        const { count } = await supabase
            .from('movie_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        return (count || 0) >= 1;
    },

    family_night_hero: async (supabase, userId) => {
        const { count } = await supabase
            .from('movie_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .contains('watched_with', ['family']);
        return (count || 0) >= 10;
    },

    theater_buff: async (supabase, userId) => {
        const { count } = await supabase
            .from('movie_logs')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('watched_in_theater', true);
        return (count || 0) >= 10;
    },

    platform_explorer: async (supabase, userId) => {
        const { data: logs } = await supabase
            .from('movie_logs')
            .select('tmdb_id')
            .eq('user_id', userId);

        if (!logs?.length) return false;

        const tmdbIds = [...new Set(logs.map((l) => l.tmdb_id))];
        const { data: movies } = await supabase
            .from('movies_library')
            .select('tmdb_id, streaming_platforms')
            .in('tmdb_id', tmdbIds.slice(0, 200));

        const platforms = new Set();
        (movies || []).forEach((m) => {
            (m.streaming_platforms || []).forEach((p) => {
                const name = String(p?.name || '').toLowerCase();
                if (name) platforms.add(name.split(' ')[0]);
            });
        });

        return platforms.size >= 5;
    },

    taste_maker: async (supabase, userId) => {
        const { data: reviews } = await supabase
            .from('reviews')
            .select('upvotes, downvotes')
            .eq('user_id', userId);

        const qualifying = (reviews || []).filter((r) => {
            const score = (r.upvotes || 0) - (r.downvotes || 0);
            return score >= 5;
        });

        return qualifying.length >= 10;
    },

    decisive: async (supabase, userId) => {
        const { count } = await supabase
            .from('activity_feed')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('event_type', 'decision_pick');
        return (count || 0) >= 20;
    },
};

async function getEarnedBadgeIds(supabase, userId) {
    const { data } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', userId);

    return new Set((data || []).map((r) => r.badge_id));
}

async function awardBadge(supabase, userId, badgeId) {
    const { data: def } = await supabase
        .from('badge_definitions')
        .select('*')
        .eq('id', badgeId)
        .maybeSingle();

    if (!def) return null;

    const { error } = await supabase
        .from('user_badges')
        .insert({ user_id: userId, badge_id: badgeId });

    if (error) {
        if (error.code === '23505') return null;
        throw new Error(error.message);
    }

    await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'badge',
        payload: { badge_id: badgeId, name: def.name, icon: def.icon },
        visibility: 'public',
    });

    return def;
}

export async function checkAndAwardBadges(userId) {
    const supabase = getSupabaseAdmin();
    const earned = await getEarnedBadgeIds(supabase, userId);
    const newlyAwarded = [];

    for (const [badgeId, checkFn] of Object.entries(BADGE_CHECKS)) {
        if (earned.has(badgeId)) continue;

        try {
            const qualifies = await checkFn(supabase, userId);
            if (!qualifies) continue;

            const def = await awardBadge(supabase, userId, badgeId);
            if (def) newlyAwarded.push(def);
        } catch (err) {
            console.warn(`badge check ${badgeId} failed:`, err.message);
        }
    }

    return { awarded: newlyAwarded };
}

export async function recordDecisionPick(userId, movie) {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from('activity_feed').insert({
        user_id: userId,
        event_type: 'decision_pick',
        target_tmdb_id: String(movie.tmdb_id),
        target_movie_title: movie.title,
        target_poster_path: movie.poster_path,
        media_type: movie.media_type || 'movie',
        payload: {},
        visibility: 'public',
    });

    if (error) throw new Error(error.message);

    return checkAndAwardBadges(userId);
}
