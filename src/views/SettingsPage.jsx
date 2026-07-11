import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, updateUserProfile } from '../lib/supabase';
import { getBlockedUsers, unblockUser, getEntityFollows, toggleEntityFollow } from '../lib/profileSystem';
import { FaLock, FaGlobe, FaUserFriends, FaTrash, FaBan } from 'react-icons/fa';

const VIS_OPTIONS = [
    { value: 'public', label: 'Public', icon: FaGlobe, desc: 'Anyone can see' },
    { value: 'followers', label: 'Followers', icon: FaUserFriends, desc: 'Only people who follow you' },
    { value: 'private', label: 'Private', icon: FaLock, desc: 'Only you' },
];

const NOTIF_KEYS = [
    { key: 'new_follower', label: 'New followers' },
    { key: 'review_like', label: 'Likes on my reviews' },
    { key: 'review_comment', label: 'Comments on my reviews' },
    { key: 'followed_release', label: 'New releases from who I follow' },
];

const Section = ({ title, desc, children }) => (
    <section className="bg-[#1a1d1f] rounded-xl border border-white/5 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {desc && <p className="text-xs text-white/40 mt-0.5 mb-4">{desc}</p>}
        {!desc && <div className="mb-4" />}
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
        <div className="min-h-screen bg-[var(--bg-primary)] pt-20 pb-16">
            <div className="max-w-2xl mx-auto px-4 space-y-5">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">Settings</h1>
                    <Link to="/profile" className="text-sm text-white/50 hover:text-white">Back to profile</Link>
                </div>

                {/* Privacy */}
                <Section title="Privacy" desc="Control who can see your profile and activity.">
                    {[['Profile', profileVis, (v) => { setProfileVis(v); saveVisibility({ profile_visibility: v }); }],
                      ['Activity', activityVis, (v) => { setActivityVis(v); saveVisibility({ activity_visibility: v }); }]].map(([label, value, onSet]) => (
                        <div key={label} className="mb-4 last:mb-0">
                            <p className="text-sm text-white/70 mb-2">{label} visibility</p>
                            <div className="grid grid-cols-3 gap-2">
                                {VIS_OPTIONS.map((o) => {
                                    const Icon = o.icon;
                                    const active = value === o.value;
                                    return (
                                        <button key={o.value} onClick={() => onSet(o.value)} className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-colors ${active ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}>
                                            <Icon className="text-sm" />
                                            <span className="text-xs font-medium">{o.label}</span>
                                            <span className="text-[10px] text-white/40 leading-tight">{o.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </Section>

                {/* Notifications */}
                <Section title="Notifications" desc="Choose what you get notified about.">
                    <div className="space-y-1">
                        {NOTIF_KEYS.map((n) => {
                            const on = notifPrefs[n.key] ?? true;
                            return (
                                <label key={n.key} className="flex items-center justify-between py-2 cursor-pointer">
                                    <span className="text-sm text-white/80">{n.label}</span>
                                    <button onClick={() => toggleNotif(n.key)} className={`w-10 h-6 rounded-full transition-colors relative ${on ? 'bg-[var(--accent-green)]' : 'bg-white/15'}`}>
                                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </label>
                            );
                        })}
                    </div>
                </Section>

                {/* Following (entities) */}
                <Section title={`Following (${followsEntities.length})`} desc="Directors, genres, franchises and more you follow.">
                    {followsEntities.length === 0 ? (
                        <p className="text-sm text-white/40">You aren't following any directors or genres yet. Follow them from a movie's page.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {followsEntities.map((f) => (
                                <div key={f.id} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-white/5 border border-white/10">
                                    <span className="text-[10px] uppercase tracking-wide text-white/40">{f.target_type}</span>
                                    <span className="text-xs text-white/80">{f.target_label || f.target_id}</span>
                                    <button onClick={() => handleUnfollowEntity(f)} className="text-white/30 hover:text-red-400 text-xs">✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* Blocked users */}
                <Section title={`Blocked (${blocked.length})`}>
                    {blocked.length === 0 ? (
                        <p className="text-sm text-white/40">You haven't blocked anyone.</p>
                    ) : (
                        <div className="space-y-2">
                            {blocked.map((b) => (
                                <div key={b.id} className="flex items-center justify-between">
                                    <span className="text-sm text-white/80">{b.display_name || `@${b.username}`}</span>
                                    <button onClick={() => handleUnblock(b.id)} className="text-xs px-3 py-1 rounded-full bg-white/5 text-white/60 hover:bg-white/10">Unblock</button>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* Account */}
                <Section title="Account">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">Email</label>
                            <div className="flex gap-2">
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 bg-[#14181c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                                <button onClick={changeEmail} className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20">Update</button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-white/50 mb-1 block">New password</label>
                            <div className="flex gap-2">
                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" className="flex-1 bg-[#14181c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30" />
                                <button onClick={changePassword} className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20">Change</button>
                            </div>
                        </div>
                    </div>
                </Section>

                {/* Danger zone */}
                <Section title="Delete account" desc="This permanently deletes your account and all your data. This cannot be undone.">
                    <div className="space-y-3">
                        <p className="text-xs text-white/50">Type your username <span className="text-white/80 font-medium">@{profile.username}</span> to confirm.</p>
                        <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={profile.username} className="w-full bg-[#14181c] border border-red-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30" />
                        <button
                            onClick={handleDelete}
                            disabled={deleting || deleteConfirm.toLowerCase() !== (profile.username || '').toLowerCase()}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/90 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <FaTrash className="text-xs" /> {deleting ? 'Deleting…' : 'Permanently delete my account'}
                        </button>
                    </div>
                </Section>
            </div>

            {msg && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-[#1c1f22] border border-white/10 text-white text-sm shadow-2xl">{msg}</div>
            )}
        </div>
    );
};

export default SettingsPage;
