import { getSupabaseAdmin } from './supabase-admin.js';

function todayUtc() {
    return new Date().toISOString().slice(0, 10);
}

function yesterdayUtc() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

export async function updateUserStreak(userId) {
    const supabase = getSupabaseAdmin();
    const today = todayUtc();
    const yesterday = yesterdayUtc();

    const { data: existing } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    let current = 1;
    let longest = 1;

    if (existing) {
        if (existing.last_activity_date === today) {
            return { streak: existing, unchanged: true };
        }
        if (existing.last_activity_date === yesterday) {
            current = (existing.current_streak || 0) + 1;
        } else {
            current = 1;
        }
        longest = Math.max(existing.longest_streak || 0, current);
    }

    const row = {
        user_id: userId,
        current_streak: current,
        longest_streak: longest,
        last_activity_date: today,
        streak_type: 'watch',
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('user_streaks')
        .upsert(row, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) throw new Error(error.message);

    return { streak: data, unchanged: false, milestone: [7, 30, 90, 365].includes(current) };
}

export async function getUserStreak(userId) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    return data || { current_streak: 0, longest_streak: 0, last_activity_date: null };
}
