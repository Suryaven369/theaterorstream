import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, updateUserProfile } from '../lib/supabase';
import { getBlockedUsers, unblockUser, getEntityFollows, toggleEntityFollow } from '../lib/profileSystem';
import { FaLock, FaGlobe, FaUserFriends, FaTrash } from 'react-icons/fa';

const VIS_OPTIONS = [
    { value: 'public', label: 'Public', icon: FaGlobe, desc: 'Anyone' },
    { value: 'followers', label: 'Followers', icon: FaUserFriends, desc: 'Followers only' },
    { value: 'private', label: 'Private', icon: FaLock, desc: 'Only you' },
];

const NOTIF_KEYS = [
    { key: 'new_follower', label: 'New followers' },
    { key: 'review_like', label: 'Likes on my reviews' },
    { key: 'review_comment', label: 'Comments on my reviews' },
    { key: 'followed_release', label: 'New releases from who I follow' },
];

const Section = ({ title, desc, children }) => (
    <section className="rounded-xl border border-white/5 bg-[#1a1d1f] p-4 sm:rounded-xl sm:p-5 md:p-6">
        <h2 className="text-[15px] font-semibold text-white sm:text-base">{title}</h2>
        {desc && <p className="mb-3 mt-0.5 text-[11px] leading-snug text-white/40 sm:mb-4 sm:text-xs">{desc}</p>}
        {!desc && <div className="mb-3 sm:mb-4" />}
        {children}
    </section>
);

const SettingsPage = () => {
    const navigate = useNavigate();
    const { user, profile, refreshProfile, signOut, loading } = useAuth();

    const [profileVis, setProfileVis] = useState('public');
    const [activityVis, setActivityVis] = useState('public');
    const [notifPrefs, setNotifPrefs] = useState({});
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [blocked, setBlocked] = useState([]);
    const [followsEntities, setFollowsEntities] = useState([]);
    const [msg, setMsg] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!loading && !user) navigate('/auth');
    }, [loading, user, navigate]);

    useEffect(() => {
        if (!profile) return;
        setProfileVis(profile.profile_visibility || 'public');
        setActivityVis(profile.activity_visibility || 'public');
        setNotifPrefs(profile.notification_prefs || {});
        setEmail(user?.email || '');
    }, [profile, user]);

    useEffect(() => {
        if (!user?.id) return;
        getBlockedUsers(user.id).then(async (rows) => {
            if (!rows.length) return setBlocked([]);
            const ids = rows.map((r) => r.blocked_id);
            const { data } = await supabase.from('user_profiles').select('id, username, display_name, avatar_url, avatar_id').in('id', ids);
            setBlocked(data || []);
        });
        getEntityFollows(user.id).then(setFollowsEntities);
    }, [user?.id]);

    const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

    const saveVisibility = async (patch) => {
        await updateUserProfile(user.id, patch);
        await refreshProfile();
        flash('Privacy updated');
    };

    const toggleNotif = async (key) => {
        const next = { ...notifPrefs, [key]: !(notifPrefs[key] ?? true) };
        setNotifPrefs(next);
        await updateUserProfile(user.id, { notification_prefs: next });
    };

    const changeEmail = async () => {
        if (!email || email === user.email) return;
        const { error } = await supabase.auth.updateUser({ email });
        flash(error ? error.message : 'Confirmation sent to your new email');
    };

    const changePassword = async () => {
        if (newPassword.length < 6) return flash('Password must be at least 6 characters');
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setNewPassword('');
        flash(error ? error.message : 'Password updated');
    };

    const handleUnblock = async (id) => {
        await unblockUser(user.id, id);
        setBlocked((p) => p.filter((b) => b.id !== id));
    };

    const handleUnfollowEntity = async (f) => {
        await toggleEntityFollow(user.id, { targetType: f.target_type, targetId: f.target_id });
        setFollowsEntities((p) => p.filter((x) => x.id !== f.id));
    };

    const handleDelete = async () => {
        setDeleting(true);
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/social/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ confirmUsername: deleteConfirm }),
        });
        const json = await res.json().catch(() => ({}));
        setDeleting(false);
        if (json.ok) { await signOut(); navigate('/'); }
        else flash(json.error || 'Could not delete account');
    };

    if (loading || !profile) {
        return <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[var(--accent-green)] border-t-transparent rounded-full" /></div>;
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] pt-[calc(4.5rem+env(safe-area-inset-top,0px))] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-16 sm:pt-20">
            <div className="mx-auto max-w-2xl space-y-3.5 px-3 sm:space-y-5 sm:px-4">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-xl font-bold text-white sm:text-2xl">Settings</h1>
                    <Link to="/profile" className="min-h-[40px] inline-flex items-center text-sm text-white/50 hover:text-white">
                        Back
                    </Link>
                </div>

                <Section title="Taste" desc="See how TheaterOrStream reads your preferences, or edit the basics.">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Link
                            to="/taste-map"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-green)] hover:bg-[var(--accent-green)]/20 sm:min-h-0 sm:justify-start sm:py-2"
                        >
                            Open Taste Map
                        </Link>
                        <Link
                            to="/settings/taste"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:border-white/30 hover:text-white sm:min-h-0 sm:justify-start sm:py-2"
                        >
                            Edit preferences
                        </Link>
                    </div>
                </Section>

                <Section title="Privacy" desc="Control who can see your profile and activity.">
                    {[['Profile', profileVis, (v) => { setProfileVis(v); saveVisibility({ profile_visibility: v }); }],
                      ['Activity', activityVis, (v) => { setActivityVis(v); saveVisibility({ activity_visibility: v }); }]].map(([label, value, onSet]) => (
                        <div key={label} className="mb-4 last:mb-0">
                            <p className="mb-2 text-sm text-white/70">{label} visibility</p>
                            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                {VIS_OPTIONS.map((o) => {
                                    const Icon = o.icon;
                                    const active = value === o.value;
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            onClick={() => onSet(o.value)}
                                            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors sm:min-h-0 sm:p-3 ${
                                                active
                                                    ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-white'
                                                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            <Icon className="text-sm" />
                                            <span className="text-[11px] font-medium sm:text-xs">{o.label}</span>
                                            <span className="hidden text-[10px] leading-tight text-white/40 sm:block">{o.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </Section>

                <Section title="Notifications" desc="Choose what you get notified about.">
                    <div className="space-y-0.5">
                        {NOTIF_KEYS.map((n) => {
                            const on = notifPrefs[n.key] ?? true;
                            return (
                                <div key={n.key} className="flex min-h-[48px] items-center justify-between gap-3 py-1.5">
                                    <span className="text-[13px] text-white/80 sm:text-sm">{n.label}</span>
                                    <button
                                        type="button"
                                        onClick={() => toggleNotif(n.key)}
                                        className={`relative h-7 w-11 shrink-0 rounded-full transition-colors sm:h-6 sm:w-10 ${on ? 'bg-[var(--accent-green)]' : 'bg-white/15'}`}
                                        aria-pressed={on}
                                        aria-label={n.label}
                                    >
                                        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all sm:h-5 sm:w-5 ${on ? 'left-[18px] sm:left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                <Section title={`Following (${followsEntities.length})`} desc="Directors, genres, franchises and more you follow.">
                    {followsEntities.length === 0 ? (
                        <p className="text-[13px] text-white/40 sm:text-sm">You aren&apos;t following any directors or genres yet.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {followsEntities.map((f) => (
                                <div key={f.id} className="flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-3 pr-2">
                                    <span className="text-[10px] uppercase tracking-wide text-white/40">{f.target_type}</span>
                                    <span className="truncate text-xs text-white/80">{f.target_label || f.target_id}</span>
                                    <button type="button" onClick={() => handleUnfollowEntity(f)} className="min-h-[28px] min-w-[28px] text-white/30 hover:text-red-400 text-xs" aria-label="Unfollow">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                <Section title={`Blocked (${blocked.length})`}>
                    {blocked.length === 0 ? (
                        <p className="text-[13px] text-white/40 sm:text-sm">You haven&apos;t blocked anyone.</p>
                    ) : (
                        <div className="space-y-2">
                            {blocked.map((b) => (
                                <div key={b.id} className="flex items-center justify-between gap-3">
                                    <span className="truncate text-sm text-white/80">{b.display_name || `@${b.username}`}</span>
                                    <button type="button" onClick={() => handleUnblock(b.id)} className="min-h-[36px] shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">Unblock</button>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                <Section title="Account">
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-xs text-white/50">Email</label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[44px] w-full flex-1 rounded-lg border border-white/10 bg-[#14181c] px-3 py-2.5 text-sm text-white sm:min-h-0 sm:py-2" />
                                <button type="button" onClick={changeEmail} className="min-h-[44px] rounded-lg bg-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/20 sm:min-h-0 sm:px-3 sm:py-2">Update</button>
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-white/50">New password</label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" className="min-h-[44px] w-full flex-1 rounded-lg border border-white/10 bg-[#14181c] px-3 py-2.5 text-sm text-white placeholder-white/30 sm:min-h-0 sm:py-2" />
                                <button type="button" onClick={changePassword} className="min-h-[44px] rounded-lg bg-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/20 sm:min-h-0 sm:px-3 sm:py-2">Change</button>
                            </div>
                        </div>
                    </div>
                </Section>

                <Section title="Delete account" desc="This permanently deletes your account and all your data. This cannot be undone.">
                    <div className="space-y-3">
                        <p className="text-[11px] text-white/50 sm:text-xs">Type your username <span className="font-medium text-white/80">@{profile.username}</span> to confirm.</p>
                        <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={profile.username} className="min-h-[44px] w-full rounded-lg border border-red-500/20 bg-[#14181c] px-3 py-2.5 text-sm text-white placeholder-white/30 sm:min-h-0 sm:py-2" />
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting || deleteConfirm.toLowerCase() !== (profile.username || '').toLowerCase()}
                            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-red-500/90 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                        >
                            <FaTrash className="text-xs" /> {deleting ? 'Deleting…' : 'Permanently delete my account'}
                        </button>
                    </div>
                </Section>
            </div>

            {msg && (
                <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border border-white/10 bg-[#1c1f22] px-5 py-3 text-sm text-white shadow-2xl lg:bottom-6">
                    {msg}
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
