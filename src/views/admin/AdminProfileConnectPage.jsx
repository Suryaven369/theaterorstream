import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiLink, FiSearch } from 'react-icons/fi';
import {
    getOfficialProfileSettings,
    getProfileByUsername,
    searchProfiles,
} from '../../lib/supabase';
import { connectOfficialProfile } from '../../lib/adminSyncApi';
import VerifiedBadge from '../../components/VerifiedBadge';

const AdminProfileConnectPage = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [connected, setConnected] = useState(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [preview, setPreview] = useState(null);
    const [searching, setSearching] = useState(false);

    const load = async () => {
        setLoading(true);
        const settings = await getOfficialProfileSettings();
        let next = settings?.userId ? { ...settings } : null;
        // Older connections may lack avatarUrl — pull from the live profile
        if (next?.userId && !next.avatarUrl) {
            const live = next.username
                ? await getProfileByUsername(next.username)
                : null;
            if (live?.avatar_url) next = { ...next, avatarUrl: live.avatar_url };
        }
        setConnected(next);
        if (settings?.username) setQuery(settings.username);
        setLoading(false);
    };

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        const q = query.trim().replace(/^@/, '');
        if (q.length < 2) {
            setResults([]);
            return undefined;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            setSearching(true);
            const rows = await searchProfiles(q, 8);
            if (!cancelled) {
                setResults(rows || []);
                setSearching(false);
            }
        }, 280);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [query]);

    const pickProfile = async (usernameOrProfile) => {
        setError(null);
        if (usernameOrProfile && typeof usernameOrProfile === 'object') {
            setPreview(usernameOrProfile);
            setQuery(usernameOrProfile.username || '');
            return;
        }
        const p = await getProfileByUsername(usernameOrProfile);
        if (!p) {
            setError('Profile not found');
            setPreview(null);
            return;
        }
        setPreview(p);
        setQuery(p.username || '');
    };

    const handleConnect = async () => {
        const username = (preview?.username || query).trim().replace(/^@/, '');
        if (!username) {
            setError('Enter the official account username');
            return;
        }
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await connectOfficialProfile({ username });
            setConnected(res.profile || null);
            setPreview(null);
            setSuccess(`Connected @${res.profile?.username}. Trailers & articles will show as this account.`);
            setTimeout(() => setSuccess(null), 4000);
        } catch (err) {
            setError(err.message || 'Failed to connect');
        } finally {
            setSaving(false);
        }
    };

    const handleDisconnect = async () => {
        if (!window.confirm('Remove the official verification from this account?')) return;
        setSaving(true);
        setError(null);
        try {
            await connectOfficialProfile({ disconnect: true });
            setConnected(null);
            setPreview(null);
            setSuccess('Official profile disconnected.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err.message || 'Failed to disconnect');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="p-4 sm:p-6 max-w-3xl text-white/50 text-sm">Loading…</div>;
    }

    return (
        <div className="p-4 sm:p-6 max-w-3xl">
            <Link
                to="/admin/settings"
                className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-4"
            >
                <FiArrowLeft /> Settings
            </Link>

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FiLink className="text-sky-400" />
                    Profile Connect
                </h1>
                <p className="text-white/50 text-sm mt-1">
                    Link the official TheaterOrStream account. Admin trailers and articles show as this profile, with a blue verified badge.
                </p>
            </div>

            {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-300">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-green-500/10 border border-green-500/30 text-green-300">
                    {success}
                </div>
            )}

            {connected?.userId && (
                <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                            {connected.avatarUrl ? (
                                <img src={connected.avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                (connected.displayName || connected.username || 'T')[0].toUpperCase()
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-white font-semibold">
                                {connected.displayName || connected.username}
                                <VerifiedBadge size={18} />
                            </div>
                            <p className="text-sm text-white/50">@{connected.username}</p>
                            {connected.connectedAt && (
                                <p className="text-[11px] text-white/35 mt-0.5">
                                    Connected {new Date(connected.connectedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                        <Link
                            to={`/${connected.username}/profile`}
                            className="text-xs text-sky-400 hover:underline shrink-0"
                        >
                            View profile
                        </Link>
                    </div>
                    <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={saving}
                        className="mt-4 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                    >
                        Disconnect official account
                    </button>
                </div>
            )}

            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-sm font-medium text-white mb-1">Find account</h3>
                <p className="text-xs text-white/40 mb-4">
                    The user account must already exist. Search by username, then connect.
                </p>

                <div className="relative mb-3">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="@theaterorstream"
                        className="w-full bg-black/30 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white border border-white/10 focus:border-sky-500/50 outline-none"
                    />
                </div>

                {searching && <p className="text-xs text-white/40 mb-2">Searching…</p>}

                {results.length > 0 && (
                    <ul className="mb-4 rounded-lg border border-white/10 overflow-hidden divide-y divide-white/5">
                        {results.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => pickProfile(p)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5"
                                >
                                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm overflow-hidden shrink-0">
                                        {p.avatar_url ? (
                                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            (p.display_name || p.username || '?')[0].toUpperCase()
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-white truncate">{p.display_name || p.username}</p>
                                        <p className="text-xs text-white/40">@{p.username}</p>
                                    </div>
                                    {p.is_verified && <VerifiedBadge size={14} className="ml-auto" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {preview && (
                    <div className="mb-4 p-3 rounded-lg bg-black/30 border border-white/10 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
                            {preview.avatar_url ? (
                                <img src={preview.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                (preview.display_name || preview.username || '?')[0].toUpperCase()
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-white font-medium truncate">
                                {preview.display_name || preview.username}
                            </p>
                            <p className="text-xs text-white/40">@{preview.username}</p>
                        </div>
                        <FiCheck className="text-sky-400" />
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleConnect}
                    disabled={saving || !(preview?.username || query.trim())}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
                >
                    {saving ? 'Connecting…' : connected?.userId ? 'Update connection' : 'Connect official account'}
                </button>
            </div>

            <div className="mt-6 text-xs text-white/35 space-y-1">
                <p>• Trailers and articles from Admin → Trailers / Articles appear as this account on the home feed.</p>
                <p>• When you approve a Franchise-tagged list (Admin → List Moderation), this official account is added as collaborator on that collection.</p>
                <p>• The profile gets a blue verified tick visible to everyone.</p>
                <p>• Only one official account can be verified at a time.</p>
            </div>
        </div>
    );
};

export default AdminProfileConnectPage;
