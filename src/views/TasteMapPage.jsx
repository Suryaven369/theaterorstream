import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SeoHead from '../components/SeoHead';
import { getTasteDashboard, getTastePreferences } from '../lib/recommendationApi';
import {
    getUserLikedMovies,
    getUserWatchedMovies,
    getAllUserRatings,
    supabase,
} from '../lib/supabase';
import { requestTasteProfileRebuild, updateTasteMapControls } from '../lib/tasteProfileApi';
import {
    deriveCinematicIdentity,
    tasteStatusFromCount,
} from '../lib/tasteMapHelpers';
import TasteMapHeader from '../components/taste-map/TasteMapHeader';
import CinematicIdentityCard from '../components/taste-map/CinematicIdentityCard';
import StrongestTastes from '../components/taste-map/StrongestTastes';
import HistoryRails from '../components/taste-map/HistoryRails';
import {
    ContentBoundarySettings,
    DiscoveryPreferenceControl,
    TasteCorrectionCentre,
    TasteMapEmptyState,
    TasteMapSkeleton,
} from '../components/taste-map/TasteMapControls';

function avgAxis(row) {
    const keys = ['acting', 'screenplay', 'sound', 'direction', 'entertainment', 'pacing', 'cinematography'];
    const vals = keys.map((k) => Number(row[k])).filter((n) => Number.isFinite(n));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function hydrateRatingPosters(ratings) {
    const ids = [...new Set((ratings || []).map((r) => String(r.movie_id)).filter(Boolean))];
    if (!ids.length) return ratings || [];
    const { data } = await supabase
        .from('movies')
        .select('tmdb_id, poster_path, title')
        .in('tmdb_id', ids.slice(0, 80));
    const byId = new Map((data || []).map((m) => [String(m.tmdb_id), m]));
    return (ratings || []).map((r) => {
        const m = byId.get(String(r.movie_id));
        return {
            ...r,
            poster_path: r.poster_path || m?.poster_path || null,
            movie_title: r.movie_title || m?.title || r.movie_title,
            _avgRating: avgAxis(r),
        };
    });
}

export default function TasteMapPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [prefs, setPrefs] = useState(null);
    const [liked, setLiked] = useState([]);
    const [watched, setWatched] = useState([]);
    const [rated, setRated] = useState([]);
    const [toast, setToast] = useState(null);
    const [rebuilding, setRebuilding] = useState(false);
    const [discoveryLevel, setDiscoveryLevel] = useState(3);
    const [boundaries, setBoundaries] = useState({});

    const load = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        setError(null);
        try {
            const [dash, tastePrefs, likedRows, watchedRows, ratingRows] = await Promise.all([
                getTasteDashboard(),
                getTastePreferences(),
                getUserLikedMovies(user.id),
                getUserWatchedMovies(user.id),
                getAllUserRatings(user.id),
            ]);
            const ratedHydrated = await hydrateRatingPosters(ratingRows);

            setDashboard(dash);
            setPrefs(tastePrefs);
            setLiked(likedRows || []);
            setWatched(watchedRows || []);
            setRated(ratedHydrated || []);

            if (dash?.discoveryLevel) setDiscoveryLevel(Number(dash.discoveryLevel) || 3);
            if (dash?.contentBoundaries) setBoundaries(dash.contentBoundaries);
        } catch (err) {
            setError(err?.message || 'Could not load Taste Map');
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        load();
    }, [load]);

    const flash = (msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2800);
    };

    const persistControls = async (patch, { silent } = {}) => {
        if (!user?.id) return { ok: false };
        const res = await updateTasteMapControls(user.id, patch);
        if (!silent) {
            if (res.ok) flash('Saved to your Taste Map');
            else flash(res.error || 'Could not save');
        }
        return res;
    };

    const mapFeedbackType = (raw) => {
        const s = String(raw || '').toLowerCase();
        if (s === 'more' || s.includes('more')) return 'more_like_this';
        if (s === 'less' || s.includes('less')) return 'less_like_this';
        if (s === 'inaccurate' || s.includes('not accurate')) return 'inaccurate';
        if (s === 'accurate' || s.includes('accurate')) return 'accurate';
        if (s === 'mood' || s.includes('mood')) return 'depends_on_mood';
        if (s.includes('remove')) return 'remove_inference';
        return s.replace(/\s+/g, '_') || 'manual_update';
    };

    const saveFeatureFeedback = async (feedbackRaw, featureLabel, featureKey) => {
        const feedback_type = mapFeedbackType(feedbackRaw);
        await persistControls({
            appendFeedback: {
                feature: featureLabel,
                feature_key: featureKey || String(featureLabel || '').toLowerCase().replace(/\s+/g, '_'),
                feedback_type,
                source: 'taste_map',
            },
        });
    };

    const { status, confidence } = useMemo(() => {
        return tasteStatusFromCount(
            dashboard?.ratingCount || rated.length,
            liked.length,
            dashboard?.eventCount || 0,
        );
    }, [dashboard, rated.length, liked.length]);

    const identity = useMemo(
        () =>
            deriveCinematicIdentity({
                genres: dashboard?.favoriteGenres || [],
                moods: dashboard?.favoriteMoods || [],
                dna: dashboard?.favoriteDna || [],
                tasteSummary: dashboard?.tasteSummary,
            }),
        [dashboard],
    );

    const hasSignal = Boolean(
        (dashboard?.favoriteGenres?.length)
        || (dashboard?.favoriteMoods?.length)
        || (dashboard?.favoriteDna?.length)
        || rated.length
        || liked.length
        || (dashboard?.ratingCount > 0),
    );

    const lowConfidence = hasSignal && (dashboard?.ratingCount || rated.length) < 5;

    const preferredGenres = useMemo(() => {
        const manualIds = prefs?.manual?.genres || [];
        const learned = dashboard?.favoriteGenres || [];
        if (!manualIds.length) return learned;
        return learned;
    }, [prefs, dashboard]);

    const preferredMoods = dashboard?.favoriteMoods || [];

    const handleRebuild = async () => {
        setRebuilding(true);
        const res = await requestTasteProfileRebuild({ includeEmbedding: true });
        setRebuilding(false);
        if (res?.ok || res?.skipped) {
            flash(res.debounced ? 'Rebuild scheduled (recently updated)' : 'Taste Map rebuilt');
            await load();
        } else {
            flash(res?.error || 'Rebuild failed');
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-[var(--bg-primary)] px-4 pb-24 pt-24">
                <p className="text-white/60">Sign in to view your Taste Map.</p>
                <Link to="/auth" className="mt-3 inline-block text-[var(--accent-green)]">Sign in</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(4.75rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-16 sm:pt-24 lg:px-8">
            <SeoHead title="Your Taste Map · TheaterOrStream" description="See how TheaterOrStream understands your movie taste." />
            <div className="mx-auto max-w-4xl">
                <TasteMapHeader
                    status={status}
                    confidence={confidence}
                    lastComputedAt={dashboard?.lastComputedAt}
                />

                {loading && <TasteMapSkeleton />}

                {!loading && error && (
                    <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center sm:rounded-2xl sm:p-6">
                        <h2 className="text-lg font-bold text-white sm:text-xl">We could not load your Taste Map</h2>
                        <p className="mt-2 text-[13px] text-white/60 sm:text-sm">
                            Your ratings and preferences are safe. Try loading the page again.
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                            <button
                                type="button"
                                onClick={load}
                                className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-sm text-white sm:min-h-0"
                            >
                                Try again
                            </button>
                            <Link to="/profile" className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/70 sm:min-h-0">
                                Return to profile
                            </Link>
                        </div>
                    </section>
                )}

                {!loading && !error && !hasSignal && <TasteMapEmptyState />}

                {!loading && !error && hasSignal && (
                    <div className="space-y-7 sm:space-y-10">
                        {lowConfidence && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-[13px] text-amber-100/90 sm:px-4 sm:text-sm">
                                <p className="font-semibold">Your Taste Map is taking shape</p>
                                <p className="mt-1 text-[12px] text-amber-100/70 sm:text-[inherit]">
                                    Early patterns only — rate a few more films for stronger preferences.
                                </p>
                            </div>
                        )}

                        {dashboard?.tasteStats?.filmCount > 0 && (
                            <p className="-mb-3 text-[12px] text-white/40 sm:-mb-5">
                                Built from {dashboard.tasteStats.filmCount} films you rated, logged, liked or disliked
                                {dashboard.tasteStats.ratedCount ? ` · your average rating is ${Number(dashboard.tasteStats.mean).toFixed(1)}, so picks are judged against your own scale` : ''}.
                            </p>
                        )}

                        <CinematicIdentityCard
                            identity={identity}
                            meta={{
                                ratingCount: dashboard?.ratingCount || rated.length,
                                confidence,
                            }}
                        />

                        <StrongestTastes
                            genres={preferredGenres}
                            moods={preferredMoods}
                            dna={dashboard?.favoriteDna || []}
                            onFeedback={(feedbackId, title) => saveFeatureFeedback(feedbackId, title)}
                        />

                        <section>
                            <h2 className="mb-2.5 text-lg font-bold text-white sm:mb-3 sm:text-xl">Prefer genres & vibes</h2>
                            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
                                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">
                                        Prefer genres
                                    </h3>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {(dashboard?.favoriteGenres || []).map((g) => (
                                            <span key={g.id} className="rounded-full bg-white/8 px-2.5 py-1 text-[12px] text-white/75 sm:text-xs">
                                                {g.name} · {g.score}%
                                            </span>
                                        ))}
                                        {(prefs?.manual?.genres || []).length > 0 && (
                                            <p className="mt-2 w-full text-[11px] text-white/35">
                                                Plus manual picks in{' '}
                                                <Link to="/settings/taste" className="text-[var(--accent-green)]">Taste Settings</Link>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">
                                        Prefer vibes
                                    </h3>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {(dashboard?.favoriteMoods || []).map((m) => (
                                            <span key={m.id} className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[12px] text-violet-200/90 sm:text-xs">
                                                {m.id.replace(/_/g, ' ')} · {m.score}%
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {((dashboard?.learnedDirectors || []).length > 0 || (dashboard?.learnedActors || []).length > 0) && (
                            <section>
                                <h2 className="mb-2.5 text-lg font-bold text-white sm:mb-3 sm:text-xl">People you keep coming back to</h2>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {[['Directors', dashboard?.learnedDirectors || []], ['Actors', dashboard?.learnedActors || []]]
                                        .filter(([, list]) => list.length)
                                        .map(([label, list]) => (
                                            <div key={label} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5 sm:p-4">
                                                <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-white/40 sm:text-xs">{label}</h3>
                                                <ul className="space-y-2.5">
                                                    {list.slice(0, 5).map((p) => (
                                                        <li key={p.id} className="flex items-center gap-3">
                                                            {p.profile_path ? (
                                                                <img src={`https://image.tmdb.org/t/p/w92${p.profile_path}`} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" />
                                                            ) : (
                                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm text-white/60">{p.name?.[0]}</span>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-white">{p.name}</p>
                                                                <p className="truncate text-[11px] text-white/45">
                                                                    {p.count} of your favourites{p.titles?.length ? ` · ${p.titles.slice(0, 2).join(', ')}` : ''}
                                                                </p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                </div>
                            </section>
                        )}

                        <HistoryRails
                            liked={liked}
                            rated={rated}
                            watched={watched}
                            disliked={dashboard?.dislikedMovies || []}
                        />

                        <DiscoveryPreferenceControl
                            level={discoveryLevel}
                            onChange={(lvl) => {
                                setDiscoveryLevel(lvl);
                                persistControls({ discovery_level: lvl });
                            }}
                        />

                        <ContentBoundarySettings
                            boundaries={boundaries}
                            onChange={(next) => {
                                setBoundaries(next);
                                persistControls({ content_boundaries: next });
                            }}
                        />

                        <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm text-white/55">
                            <h2 className="text-base font-semibold text-white">How your Taste Map works</h2>
                            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-white/45">
                                <li>Uses ratings, likes, and feedback — watch alone does not mean you loved it</li>
                                <li>Edits on this page save to your private taste profile in the database</li>
                                <li>You can correct major inferences and rebuild anytime</li>
                                <li>Content boundaries stay private</li>
                                <li>This is not a psychological diagnosis</li>
                            </ul>
                        </section>

                        <TasteCorrectionCentre
                            rebuilding={rebuilding}
                            onRebuild={handleRebuild}
                            toast={toast}
                        />
                    </div>
                )}

                {!loading && !error && hasSignal && toast && (
                    <div
                        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-full border border-white/10 bg-[#1c1f22] px-4 py-2.5 text-sm text-white shadow-xl lg:bottom-8"
                        role="status"
                    >
                        {toast}
                    </div>
                )}
            </div>
        </div>
    );
}
