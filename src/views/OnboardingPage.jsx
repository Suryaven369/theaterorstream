import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    checkUsernameAvailable,
    completeTasteOnboarding,
    loadTasteOnboardingPrefill,
} from '../lib/supabase';
import { getTrendingContentFromEdge } from '../lib/contentEdgeApi';
import { MOVIE_GENRES } from '../lib/contentApi';
import {
    AVATARS,
    REGIONS,
    MOOD_OPTIONS,
    SEED_MOVIE_COUNT,
    MAX_GENRE_PICKS,
    MAX_MOOD_PICKS,
    getStreamingServicesForRegion,
    getCertificationsForRegion,
} from '../constants/onboarding';
import {
    DEFAULT_ONBOARDING_STATE,
    loadOnboardingDraft,
    saveOnboardingDraft,
    clearOnboardingDraft,
    buildGenreWeights,
    buildMoodPreferences,
    quickReactionToRatings,
} from '../lib/onboardingUtils';
import { OnboardingProgress, StepShell, posterUrl } from '../components/onboarding/OnboardingUI';

const GENRE_EMOJI = {
    28: '💥', 12: '🗺️', 16: '🎨', 35: '😂', 80: '🔍', 99: '🎬', 18: '🎭',
    10751: '👨‍👩‍👧', 14: '🧙', 36: '📜', 27: '👻', 10402: '🎵', 9648: '🕵️',
    10749: '💕', 878: '🚀', 53: '😱', 10752: '⚔️', 37: '🤠',
};

const OnboardingPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const tasteMode = searchParams.get('mode') === 'taste';
    const { user, profile, refreshProfile, loading: authLoading } = useAuth();

    const [state, setState] = useState(() => {
        const draft = loadOnboardingDraft();
        if (draft && !tasteMode) return draft;
        if (draft && tasteMode && draft.step >= 2) return draft;
        return { ...DEFAULT_ONBOARDING_STATE, step: tasteMode ? 2 : 1 };
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [usernameAvailable, setUsernameAvailable] = useState(null);
    const [checkingUsername, setCheckingUsername] = useState(false);
    const [seedMovies, setSeedMovies] = useState([]);
    const [loadingSeeds, setLoadingSeeds] = useState(false);
    const [prefillLoaded, setPrefillLoaded] = useState(!tasteMode);

    const {
        step, username, dateOfBirth, selectedAvatar, region,
        streamingServices, genreIds, moodIds, seedRatings,
        familyModeEnabled, familyMaxCertification,
    } = state;

    const exitToProfile = useCallback(() => {
        const uname = profile?.username || username;
        navigate(uname ? `/${uname}/profile` : '/', { replace: true });
    }, [navigate, profile?.username, username]);

    const setField = useCallback((patch) => {
        setState((prev) => {
            const next = { ...prev, ...patch };
            saveOnboardingDraft(next);
            return next;
        });
    }, []);

    useEffect(() => {
        if (!tasteMode || !user?.id || prefillLoaded) return;

        let cancelled = false;
        (async () => {
            const prefill = await loadTasteOnboardingPrefill(user.id, profile);
            if (cancelled || !prefill) {
                if (!cancelled) setPrefillLoaded(true);
                return;
            }
            setState((prev) => {
                const next = {
                    ...prev,
                    step: 2,
                    region: prefill.region,
                    streamingServices: prefill.streamingServices,
                    genreIds: prefill.genreIds,
                    moodIds: prefill.moodIds,
                    familyModeEnabled: prefill.familyModeEnabled,
                    familyMaxCertification: prefill.familyMaxCertification,
                };
                saveOnboardingDraft(next);
                return next;
            });
            setPrefillLoaded(true);
        })();

        return () => { cancelled = true; };
    }, [tasteMode, user?.id, profile, prefillLoaded]);

    useEffect(() => {
        if (!profile || authLoading || tasteMode) return;
        const patch = {};
        if (profile.username && !username) patch.username = profile.username;
        if (profile.date_of_birth && !dateOfBirth) patch.dateOfBirth = profile.date_of_birth;
        if (profile.avatar_id && !selectedAvatar) patch.selectedAvatar = profile.avatar_id;
        if (profile.preferred_region && state.region === 'IN' && profile.preferred_region !== 'IN') {
            patch.region = profile.preferred_region;
        }
        if (Object.keys(patch).length) setField(patch);
    }, [profile, authLoading, username, dateOfBirth, selectedAvatar, state.region, setField]);

    useEffect(() => {
        if (username.length < 3) {
            setUsernameAvailable(null);
            return;
        }
        if (profile?.username === username.toLowerCase()) {
            setUsernameAvailable(true);
            return;
        }
        const timer = setTimeout(async () => {
            setCheckingUsername(true);
            const available = await checkUsernameAvailable(username, user?.id);
            setUsernameAvailable(available);
            setCheckingUsername(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [username, user?.id, profile?.username]);

    useEffect(() => {
        if (step !== 4 || seedMovies.length) return;
        let cancelled = false;
        (async () => {
            setLoadingSeeds(true);
            try {
                const trending = await getTrendingContentFromEdge(null, 24);
                const movies = (trending || [])
                    .filter((m) => m.poster_path && m.tmdb_id)
                    .slice(0, SEED_MOVIE_COUNT);
                if (!cancelled) setSeedMovies(movies);
            } catch {
                if (!cancelled) setSeedMovies([]);
            } finally {
                if (!cancelled) setLoadingSeeds(false);
            }
        })();
        return () => { cancelled = true; };
    }, [step, seedMovies.length]);

    const streamingOptions = useMemo(() => getStreamingServicesForRegion(region), [region]);
    const certificationOptions = useMemo(() => getCertificationsForRegion(region), [region]);

    const toggleInList = (list, id, max) => {
        if (list.includes(id)) return list.filter((x) => x !== id);
        if (list.length >= max) return list;
        return [...list, id];
    };

    const validateStep1 = () => {
        if (username.length < 3) return 'Username must be at least 3 characters';
        if (!usernameAvailable && profile?.username !== username.toLowerCase()) {
            return 'This username is taken';
        }
        if (!dateOfBirth) return 'Please enter your date of birth';
        const dob = new Date(dateOfBirth);
        const age = Math.floor((Date.now() - dob) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 13) return 'You must be at least 13 years old';
        if (!selectedAvatar) return 'Please pick an avatar';
        return null;
    };

    const handleFinish = async (overrides = {}) => {
        setLoading(true);
        setError('');

        const finalFamilyMode = overrides.familyModeEnabled ?? familyModeEnabled;
        const finalFamilyCert = overrides.familyMaxCertification !== undefined
            ? overrides.familyMaxCertification
            : (finalFamilyMode
                ? (familyMaxCertification || certificationOptions[0]?.id)
                : null);

        const genreWeights = buildGenreWeights(genreIds);
        const moodPreferences = buildMoodPreferences(moodIds);
        const favoriteGenres = genreIds.map(String);

        const seedPayload = seedMovies
            .map((movie) => {
                const id = String(movie.tmdb_id || movie.id);
                const reaction = seedRatings[id];
                if (!reaction || reaction === 'skip') return null;
                return {
                    tmdbId: id,
                    title: movie.title,
                    reaction,
                    ratings: quickReactionToRatings(reaction),
                };
            })
            .filter(Boolean);

        const result = await completeTasteOnboarding(user.id, {
            profile: {
                username: tasteMode ? (profile?.username || username) : username,
                displayName: tasteMode ? (profile?.display_name || profile?.username || username) : username,
                dateOfBirth: tasteMode ? (profile?.date_of_birth || dateOfBirth) : dateOfBirth,
                avatarId: tasteMode ? (profile?.avatar_id || selectedAvatar) : selectedAvatar,
                preferredRegion: region,
                favoriteGenres,
                moodPreferences,
                familyModeEnabled: finalFamilyMode,
                familyMaxCertification: finalFamilyMode ? finalFamilyCert : null,
            },
            streamingServiceIds: streamingServices,
            tasteProfile: {
                genreWeights,
                moodPreferences,
                preferredRegion: region,
                familyModeEnabled: finalFamilyMode,
                familyMaxCertification: finalFamilyMode ? finalFamilyCert : null,
                seedMovieIds: Object.entries(seedRatings)
                    .filter(([, r]) => r && r !== 'skip')
                    .map(([id]) => id),
                stepData: {
                    genres: genreIds,
                    moods: moodIds,
                    streaming: streamingServices,
                    region,
                    family_mode: finalFamilyMode,
                },
            },
            seedRatings: seedPayload,
        });

        setLoading(false);

        if (!result.success) {
            setError(result.error?.message || 'Failed to complete setup. Please try again.');
            return;
        }

        clearOnboardingDraft();
        await refreshProfile();
        if (tasteMode) {
            exitToProfile();
        } else {
            navigate('/', { replace: true });
        }
    };

    if (authLoading || (tasteMode && !prefillLoaded)) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 pt-20">
                <p className="text-white/50 text-sm">Loading your preferences…</p>
            </div>
        );
    }

    const selectedAvatarData = AVATARS.find((a) => a.id === selectedAvatar);

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 pt-20 pb-10">
            <div className="w-full max-w-lg">
                {tasteMode && (
                    <p className="text-center text-xs text-orange-400/80 mb-3 font-medium">
                        Taste & streaming preferences
                    </p>
                )}
                <OnboardingProgress step={step} tasteMode={tasteMode} />

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                {/* Step 1: Identity (new users only) */}
                {!tasteMode && step === 1 && (
                    <StepShell
                        title="Set up your profile"
                        subtitle="Username, birthday, region & avatar"
                        onContinue={() => {
                            const err = validateStep1();
                            if (err) { setError(err); return; }
                            setError('');
                            setField({ step: 2 });
                        }}
                        continueDisabled={checkingUsername || usernameAvailable === false}
                        continueLabel="Continue"
                    >
                        <div className="space-y-4 text-left">
                            <div>
                                <label className="text-xs text-white/40 mb-1 block">Username</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => {
                                            const v = e.target.value.toLowerCase();
                                            if (v === '' || /^[a-z0-9_]+$/.test(v)) setField({ username: v });
                                        }}
                                        maxLength={20}
                                        placeholder="username"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white focus:outline-none focus:border-orange-500"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm">
                                        {checkingUsername && '…'}
                                        {!checkingUsername && usernameAvailable === true && <span className="text-green-400">✓</span>}
                                        {!checkingUsername && usernameAvailable === false && <span className="text-red-400">✗</span>}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-white/40 mb-1 block">Date of birth</label>
                                <input
                                    type="date"
                                    value={dateOfBirth}
                                    onChange={(e) => setField({ dateOfBirth: e.target.value })}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-white/40 mb-2 block">Your region (for streaming)</label>
                                <div className="flex flex-wrap gap-2">
                                    {REGIONS.map((r) => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => setField({ region: r.id, streamingServices: [] })}
                                            className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                                                region === r.id
                                                    ? 'border-orange-500 bg-orange-500/20 text-white'
                                                    : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20'
                                            }`}
                                        >
                                            {r.flag} {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-white/40 mb-2 block">Avatar</label>
                                {selectedAvatar && selectedAvatarData && (
                                    <div className="flex justify-center mb-3">
                                        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${selectedAvatarData.bg} flex items-center justify-center ring-2 ring-orange-500`}>
                                            <span className="text-3xl">{selectedAvatarData.emoji}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-6 gap-2">
                                    {AVATARS.map((avatar) => (
                                        <button
                                            key={avatar.id}
                                            type="button"
                                            onClick={() => setField({ selectedAvatar: avatar.id })}
                                            className={`aspect-square rounded-xl bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-xl transition-all ${
                                                selectedAvatar === avatar.id ? 'ring-2 ring-orange-500 scale-105' : 'opacity-70 hover:opacity-100'
                                            }`}
                                        >
                                            {avatar.emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </StepShell>
                )}

                {/* Step 2: Streaming */}
                {step === 2 && (
                    <StepShell
                        title="Where do you watch?"
                        subtitle="Pick your streaming apps — we’ll filter what you can actually watch"
                        onBack={tasteMode ? exitToProfile : () => setField({ step: 1 })}
                        onContinue={() => { setError(''); setField({ step: 3 }); }}
                        onSkip={() => setField({ step: 3, streamingServices: [] })}
                        showSkip
                        skipLabel="Skip — I’ll add these later"
                    >
                        <div className="grid grid-cols-2 gap-2">
                            {streamingOptions.map((svc) => {
                                const selected = streamingServices.includes(svc.id);
                                return (
                                    <button
                                        key={svc.id}
                                        type="button"
                                        onClick={() => setField({
                                            streamingServices: toggleInList(streamingServices, svc.id, 99),
                                        })}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            selected
                                                ? 'border-orange-500 bg-orange-500/15'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <span className="text-2xl">{svc.emoji}</span>
                                        <p className="text-sm text-white mt-1 font-medium">{svc.label}</p>
                                    </button>
                                );
                            })}
                        </div>
                        {streamingServices.length > 0 && (
                            <p className="text-xs text-white/40 text-center mt-3">
                                {streamingServices.length} selected
                            </p>
                        )}
                    </StepShell>
                )}

                {/* Step 3: Genres & mood */}
                {step === 3 && (
                    <StepShell
                        title="What’s your vibe?"
                        subtitle={`Pick up to ${MAX_GENRE_PICKS} genres and ${MAX_MOOD_PICKS} moods`}
                        onBack={() => setField({ step: 2 })}
                        onContinue={() => { setError(''); setField({ step: 4 }); }}
                        onSkip={() => setField({ step: 4, genreIds: [], moodIds: [] })}
                        showSkip
                    >
                        <p className="text-xs text-orange-400/80 mb-2 font-medium">Genres</p>
                        <div className="flex flex-wrap gap-2 mb-5">
                            {MOVIE_GENRES.map((g) => {
                                const selected = genreIds.includes(g.id);
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setField({
                                            genreIds: toggleInList(genreIds, g.id, MAX_GENRE_PICKS),
                                        })}
                                        className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                                            selected
                                                ? 'border-orange-500 bg-orange-500/20 text-white'
                                                : 'border-white/10 text-white/60 hover:border-white/25'
                                        }`}
                                    >
                                        {GENRE_EMOJI[g.id] || '🎬'} {g.name}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-xs text-orange-400/80 mb-2 font-medium">Moods</p>
                        <div className="grid grid-cols-2 gap-2">
                            {MOOD_OPTIONS.map((m) => {
                                const selected = moodIds.includes(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setField({
                                            moodIds: toggleInList(moodIds, m.id, MAX_MOOD_PICKS),
                                        })}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            selected
                                                ? 'border-orange-500 bg-orange-500/15'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <span className="text-xl">{m.emoji}</span>
                                        <p className="text-sm text-white font-medium mt-1">{m.label}</p>
                                        <p className="text-[10px] text-white/40">{m.description}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </StepShell>
                )}

                {/* Step 4: Seed ratings */}
                {step === 4 && (
                    <StepShell
                        title="Rate a few titles"
                        subtitle="Quick reactions help us learn your taste faster"
                        onBack={() => setField({ step: 3 })}
                        onContinue={() => { setError(''); setField({ step: 5 }); }}
                        onSkip={() => setField({ step: 5, seedRatings: {} })}
                        showSkip
                        continueLabel="Continue"
                    >
                        {loadingSeeds ? (
                            <p className="text-center text-white/50 py-8">Loading picks…</p>
                        ) : seedMovies.length === 0 ? (
                            <p className="text-center text-white/50 py-8">No titles available — you can skip this step.</p>
                        ) : (
                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                                {seedMovies.map((movie) => {
                                    const id = String(movie.tmdb_id || movie.id);
                                    const reaction = seedRatings[id];
                                    return (
                                        <div key={id} className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                            <img
                                                src={posterUrl(movie.poster_path, 'w92') || '/placeholder.png'}
                                                alt=""
                                                className="w-12 h-[72px] object-cover rounded-lg bg-white/10"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{movie.title}</p>
                                                <div className="flex gap-1.5 mt-2">
                                                    {[
                                                        { id: 'meh', label: '😐', title: 'Meh' },
                                                        { id: 'like', label: '👍', title: 'Like' },
                                                        { id: 'love', label: '❤️', title: 'Love' },
                                                        { id: 'skip', label: '⏭', title: 'Skip' },
                                                    ].map((btn) => (
                                                        <button
                                                            key={btn.id}
                                                            type="button"
                                                            title={btn.title}
                                                            onClick={() => setField({
                                                                seedRatings: { ...seedRatings, [id]: btn.id },
                                                            })}
                                                            className={`flex-1 py-1.5 rounded-lg text-lg border transition-all ${
                                                                reaction === btn.id
                                                                    ? 'border-orange-500 bg-orange-500/20'
                                                                    : 'border-white/10 hover:border-white/25'
                                                            }`}
                                                        >
                                                            {btn.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-[11px] text-white/35 text-center mt-2">
                            Saved to your ratings — powers recommendations & AI taste learning
                        </p>
                    </StepShell>
                )}

                {/* Step 5: Family mode */}
                {step === 5 && (
                    <StepShell
                        title="Family mode"
                        subtitle="Optional — keep recommendations kid-safe"
                        onBack={() => setField({ step: 4 })}
                        onContinue={handleFinish}
                        onSkip={() => handleFinish({ familyModeEnabled: false, familyMaxCertification: null })}
                        showSkip
                        loading={loading}
                        continueLabel="Finish & explore 🎉"
                    >
                        <button
                            type="button"
                            onClick={() => setField({ familyModeEnabled: !familyModeEnabled })}
                            className={`w-full p-4 rounded-xl border text-left transition-all mb-4 ${
                                familyModeEnabled
                                    ? 'border-orange-500 bg-orange-500/15'
                                    : 'border-white/10 bg-white/5'
                            }`}
                        >
                            <p className="text-white font-medium">👨‍👩‍👧 Watching with kids?</p>
                            <p className="text-xs text-white/50 mt-1">
                                Filter out titles above your chosen certification
                            </p>
                        </button>

                        {familyModeEnabled && (
                            <div className="space-y-2">
                                {certificationOptions.map((cert) => (
                                    <button
                                        key={cert.id}
                                        type="button"
                                        onClick={() => setField({ familyMaxCertification: cert.id })}
                                        className={`w-full p-3 rounded-xl border text-left transition-all ${
                                            familyMaxCertification === cert.id
                                                ? 'border-orange-500 bg-orange-500/15'
                                                : 'border-white/10 bg-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <p className="text-sm text-white font-medium">{cert.label}</p>
                                        <p className="text-xs text-white/40">{cert.description}</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {(genreIds.length > 0 || moodIds.length > 0) && (
                            <div className="mt-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                <p className="text-xs text-orange-200/90">
                                    Based on your picks, we’ll prioritize{' '}
                                    {genreIds.length > 0 && 'your genres'}
                                    {genreIds.length > 0 && moodIds.length > 0 && ' & '}
                                    {moodIds.length > 0 && 'moods you love'}
                                    {' '}when recommendations launch.
                                </p>
                            </div>
                        )}
                    </StepShell>
                )}
            </div>
        </div>
    );
};

export default OnboardingPage;
