import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    checkUsernameAvailable,
    completeTasteOnboarding,
    loadTasteOnboardingPrefill,
} from '../lib/supabase';
import { getTrendingContentFromEdge } from '../lib/contentEdgeApi';
import { getCertificationsForRegion } from '../constants/onboarding';
import {
    getVisibleSteps,
    getNextStepId,
    getPrevStepId,
    resolveInitialStepId,
} from '../constants/onboardingSteps';
import {
    DEFAULT_ONBOARDING_STATE,
    loadOnboardingDraft,
    saveOnboardingDraft,
    clearOnboardingDraft,
    mergeDraftWithDefaults,
    buildGenreWeights,
    buildMoodPreferences,
    buildAxisPreferences,
    buildRuntimeRange,
    buildOnboardingStepData,
    quickReactionToRatings,
} from '../lib/onboardingUtils';
import { generateTasteIdentity, pickFirstRecommendation } from '../lib/tasteIdentity';
import { CinematicLayout } from '../components/onboarding/CinematicLayout';
import { OnboardingPhaseProgress } from '../components/onboarding/OnboardingProgress';
import OnboardingStepRenderer from '../components/onboarding/OnboardingStepRenderer';

const OnboardingPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const tasteMode = searchParams.get('mode') === 'taste';
    const { user, profile, refreshProfile, loading: authLoading } = useAuth();

    const [state, setState] = useState(() => {
        const draft = loadOnboardingDraft();
        const merged = mergeDraftWithDefaults(draft || {});
        return {
            ...merged,
            stepId: resolveInitialStepId(tasteMode, draft),
        };
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [usernameAvailable, setUsernameAvailable] = useState(null);
    const [checkingUsername, setCheckingUsername] = useState(false);
    const [moviePool, setMoviePool] = useState([]);
    const [loadingMovies, setLoadingMovies] = useState(false);
    const [prefillLoaded, setPrefillLoaded] = useState(!tasteMode);

    const mergeMovies = useCallback((incoming) => {
        setMoviePool((prev) => {
            const seen = new Set(prev.map((m) => String(m.tmdb_id || m.id)));
            const merged = [...prev];
            incoming.forEach((m) => {
                const id = String(m.tmdb_id || m.id);
                if (!seen.has(id) && m.poster_path) {
                    seen.add(id);
                    merged.push(m);
                }
            });
            return merged;
        });
    }, []);

    const loadMovies = useCallback(async (limit = 32, append = false) => {
        setLoadingMovies(true);
        try {
            const trending = await getTrendingContentFromEdge(null, limit);
            const movies = (trending || []).filter((m) => m.poster_path && m.tmdb_id);
            if (append) mergeMovies(movies);
            else setMoviePool(movies);
        } catch {
            if (!append) setMoviePool([]);
        } finally {
            setLoadingMovies(false);
        }
    }, [mergeMovies]);

    const requestMoreMovies = useCallback(() => {
        if (loadingMovies) return;
        loadMovies(48, true);
    }, [loadMovies, loadingMovies]);

    const ctx = useMemo(() => ({ tasteMode, state }), [tasteMode, state]);
    const visibleSteps = useMemo(() => getVisibleSteps(ctx), [ctx]);
    const currentStep = visibleSteps.find((s) => s.id === state.stepId) || visibleSteps[0];

    const layoutVariant = useMemo(() => {
        if (['ai-intro', 'generating', 'taste-identity', 'first-recommendation'].includes(state.stepId)) return 'ai';
        if (state.stepId === 'completion') return 'complete';
        return 'default';
    }, [state.stepId]);

    const recommendation = useMemo(
        () => pickFirstRecommendation(moviePool, state),
        [moviePool, state],
    );

    const exitToProfile = useCallback(() => {
        const uname = profile?.username || state.username;
        navigate(uname ? `/${uname}/profile` : '/', { replace: true });
    }, [navigate, profile?.username, state.username]);

    const setField = useCallback((patch) => {
        setState((prev) => {
            const next = { ...prev, ...patch };
            saveOnboardingDraft(next);
            return next;
        });
    }, []);

    const goNext = useCallback(() => {
        const nextId = getNextStepId(state.stepId, ctx);
        if (nextId) setField({ stepId: nextId });
    }, [state.stepId, ctx, setField]);

    const goBack = useCallback(() => {
        const prevId = getPrevStepId(state.stepId, ctx);
        if (prevId) {
            setField({ stepId: prevId });
            return;
        }
        if (tasteMode) exitToProfile();
    }, [state.stepId, ctx, setField, tasteMode, exitToProfile]);

    const skipStep = useCallback(() => {
        goNext();
    }, [goNext]);

    useEffect(() => {
        if (!tasteMode || !user?.id || prefillLoaded) return undefined;

        let cancelled = false;
        (async () => {
            const prefill = await loadTasteOnboardingPrefill(user.id, profile);
            if (cancelled) return;

            if (prefill) {
                setState((prev) => {
                    const next = mergeDraftWithDefaults({ ...prev, ...prefill, stepId: prev.stepId || 'welcome' });
                    saveOnboardingDraft(next);
                    return next;
                });
            }
            setPrefillLoaded(true);
        })();

        return () => { cancelled = true; };
    }, [tasteMode, user?.id, profile, prefillLoaded]);

    useEffect(() => {
        if (!profile || authLoading || tasteMode) return;
        const patch = {};
        if (profile.username && !state.username) patch.username = profile.username;
        if (profile.date_of_birth && !state.dateOfBirth) patch.dateOfBirth = profile.date_of_birth;
        if (profile.avatar_id && !state.selectedAvatar) patch.selectedAvatar = profile.avatar_id;
        if (profile.preferred_region && state.region === 'IN' && profile.preferred_region !== 'IN') {
            patch.region = profile.preferred_region;
        }
        if (Object.keys(patch).length) setField(patch);
    }, [profile, authLoading, tasteMode, state.username, state.dateOfBirth, state.selectedAvatar, state.region, setField]);

    useEffect(() => {
        if (state.username.length < 3) {
            setUsernameAvailable(null);
            return undefined;
        }
        if (profile?.username === state.username.toLowerCase()) {
            setUsernameAvailable(true);
            return undefined;
        }
        const timer = setTimeout(async () => {
            setCheckingUsername(true);
            const available = await checkUsernameAvailable(state.username, user?.id);
            setUsernameAvailable(available);
            setCheckingUsername(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [state.username, user?.id, profile?.username]);

    useEffect(() => {
        const needsMovies = ['favorite-movies', 'swipe-reactions', 'first-recommendation'].includes(state.stepId);
        if (!needsMovies || moviePool.length > 0) return undefined;

        loadMovies(state.stepId === 'swipe-reactions' ? 40 : 32, false);
        return undefined;
    }, [state.stepId, moviePool.length, loadMovies]);

    const certificationOptions = useMemo(
        () => getCertificationsForRegion(state.region),
        [state.region],
    );

    const handleFinish = async () => {
        setLoading(true);
        setError('');

        const tasteIdentity = state.tasteIdentity || generateTasteIdentity(state);
        const genreWeights = buildGenreWeights(state.genreIds);
        const moodPreferences = buildMoodPreferences(state.moodIds, state.vibeIds);
        const axisPreferences = buildAxisPreferences(state);
        const runtimeRange = buildRuntimeRange(state.runtimePref);
        const stepData = buildOnboardingStepData({ ...state, tasteIdentity });

        const allRatings = { ...state.seedRatings, ...state.swipeRatings };
        const isCountedReaction = (r) => r && r !== 'havent_watched' && r !== 'skip';
        const ratedIds = new Set(
            Object.entries(allRatings)
                .filter(([, r]) => isCountedReaction(r))
                .map(([id]) => id),
        );

        const seedPayload = moviePool
            .filter((m) => ratedIds.has(String(m.tmdb_id || m.id)))
            .map((movie) => {
                const id = String(movie.tmdb_id || movie.id);
                const reaction = allRatings[id];
                if (!isCountedReaction(reaction)) return null;
                return {
                    tmdbId: id,
                    title: movie.title,
                    reaction,
                    ratings: quickReactionToRatings(reaction),
                };
            })
            .filter(Boolean);

        const finalFamilyCert = state.familyModeEnabled
            ? (state.familyMaxCertification || certificationOptions[0]?.id)
            : null;

        const result = await completeTasteOnboarding(user.id, {
            profile: {
                username: tasteMode ? (profile?.username || state.username) : state.username,
                displayName: tasteMode ? (profile?.display_name || profile?.username || state.username) : state.username,
                dateOfBirth: tasteMode ? (profile?.date_of_birth || state.dateOfBirth) : state.dateOfBirth,
                avatarId: tasteMode ? (profile?.avatar_id || state.selectedAvatar) : state.selectedAvatar,
                preferredRegion: state.region,
                favoriteGenres: state.genreIds.map(String),
                moodPreferences,
                familyModeEnabled: state.familyModeEnabled,
                familyMaxCertification: finalFamilyCert,
            },
            streamingServiceIds: state.streamingServices,
            tasteProfile: {
                genreWeights,
                moodPreferences,
                preferredRegion: state.region,
                axisPreferences,
                preferredRuntimeRange: runtimeRange,
                tasteSummary: `${tasteIdentity.title} — ${tasteIdentity.tagline}`,
                familyModeEnabled: state.familyModeEnabled,
                familyMaxCertification: finalFamilyCert,
                seedMovieIds: [...ratedIds],
                stepData,
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
        if (tasteMode) exitToProfile();
        else navigate('/', { replace: true });
    };

    if (authLoading || (tasteMode && !prefillLoaded)) {
        return (
            <CinematicLayout>
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-white/50 text-sm">Loading your cinematic profile…</p>
                </div>
            </CinematicLayout>
        );
    }

    if (!currentStep) {
        return (
            <CinematicLayout>
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-white/50 text-sm">Onboarding step not found.</p>
                </div>
            </CinematicLayout>
        );
    }

    return (
        <CinematicLayout variant={layoutVariant}>
            {tasteMode && state.stepId !== 'welcome' && (
                <p className="text-center text-xs text-orange-400/70 mb-2 font-medium">
                    Updating taste & streaming preferences
                </p>
            )}

            {currentStep.type !== 'welcome' && currentStep.type !== 'completion' && (
                <OnboardingPhaseProgress stepId={state.stepId} ctx={ctx} />
            )}

            {error && currentStep.type !== 'identity' && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                    {error}
                </div>
            )}

            <div className="flex-1 flex flex-col min-h-[60vh]">
                <OnboardingStepRenderer
                    step={currentStep}
                    state={state}
                    setField={setField}
                    onNext={goNext}
                    onBack={goBack}
                    onSkip={skipStep}
                    onFinish={handleFinish}
                    loading={loading}
                    error={error}
                    setError={setError}
                    tasteMode={tasteMode}
                    usernameAvailable={usernameAvailable}
                    checkingUsername={checkingUsername}
                    profile={profile}
                    moviePool={moviePool}
                    loadingMovies={loadingMovies}
                    recommendation={recommendation}
                    variant={layoutVariant}
                    onRequestMoreMovies={requestMoreMovies}
                    activeStepId={state.stepId}
                />
            </div>
        </CinematicLayout>
    );
};

export default OnboardingPage;
