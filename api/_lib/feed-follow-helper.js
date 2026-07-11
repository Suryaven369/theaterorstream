export async function getUserFollowing(supabase, userId) {
    const { data } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', userId);

    return (data || []).map((r) => r.following_id);
}
