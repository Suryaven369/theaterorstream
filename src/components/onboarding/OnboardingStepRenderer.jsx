import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { MOVIE_GENRES } from '../../lib/contentApi';
import {
    AVATARS,
    REGIONS,
    MOOD_OPTIONS,
    MAX_GENRE_PICKS,
    MAX_MOOD_PICKS,
    SWIPE_RATING_TARGET,
    getStreamingServicesForRegion,
    getCertificationsForRegion,
} from '../../constants/onboarding';
import * as TastePrefs from '../../constants/tastePreferences';
import { generateTasteIdentity, buildRecommendationReason } from '../../lib/tasteIdentity';
import { toggleListItem } from '../../lib/onboardingUtils';
import {
    CinematicTitle,
    CinematicCTA,
    OptionGrid,
    DirectorGrid,
} from './CinematicLayout';
import { posterUrl } from './OnboardingUI';

const GENRE_EMOJI = {
    28: '💥', 12: '🗺️', 16: '🎨', 35: '😂', 80: '🔍', 99: '🎬', 18: '🎭',
    10751: '👨‍👩‍👧', 14: '🧙', 36: '📜', 27: '👻', 10402: '🎵', 9648: '🕵️',
    10749: '💕', 878: '🚀', 53: '😱', 10752: '⚔️', 37: '🤠',
};

const AI_MESSAGES = [
    'Learning your emotional patterns…',
    'Mapping genre affinities…',
    'Calibrating recommendation engine…',
    'Building your cinematic fingerprint…',
];

function getOptions(optionsKey) {
    return TastePrefs[optionsKey] || [];
}

export default function OnboardingStepRenderer({
    step,
    state,
    setField,
    onNext,
    onBack,
    onSkip,
    onFinish,
    loading,
    error,
    setError,
    tasteMode,
    usernameAvailable,
    checkingUsername,
    profile,
    moviePool,
    loadingMovies,
    recommendation,
    variant,
    onRequestMoreMovies,
    activeStepId,
}) {
    const [aiMsgIdx, setAiMsgIdx] = useState(0);
    const [generatingDone, setGeneratingDone] = useState(false);
    const stateRef = React.useRef(state);
    stateRef.current = state;

    useEffect(() => {
        if (step.type !== 'generating') return undefined;
        setGeneratingDone(false);
        setAiMsgIdx(0);
        const msgTimer = setInterval(() => {
            setAiMsgIdx((i) => (i + 1) % AI_MESSAGES.length);
        }, 550);
        // Brief cinematic pause only — identity is computed locally, not via API
        const doneTimer = setTimeout(() => {
            setGeneratingDone(true);
            setField({ tasteIdentity: generateTasteIdentity(stateRef.current) });
        }, 1100);
        return () => {
            clearInterval(msgTimer);
            clearTimeout(doneTimer);
        };
    }, [step.id, step.type, setField]);

    useEffect(() => {
        if (step.type === 'generating' && generatingDone) {
            const t = setTimeout(onNext, 350);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [step.type, generatingDone, onNext]);

    const certificationOptions = useMemo(
        () => getCertificationsForRegion(state.region),
        [state.region],
    );
    const streamingOptions = useMemo(
        () => getStreamingServicesForRegion(state.region),
        [state.region],
    );

    const validateIdentity = () => {
        if (state.username.length < 3) return 'Username must be at least 3 characters';
        if (!usernameAvailable && profile?.username !== state.username.toLowerCase()) {
            return 'This username is taken';
        }
        if (!state.dateOfBirth) return 'Please enter your date of birth';
        const age = Math.floor((Date.now() - new Date(state.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000));
        if (age < 13) return 'You must be at least 13 years old';
        if (!state.selectedAvatar) return 'Please pick an avatar';
        return null;
    };

    const handleContinue = () => {
        if (step.type === 'identity') {
            const err = validateIdentity();
            if (err) { setError(err); return; }
        }
        if (step.type === 'favorite-movies' && step.minPick && state.favoriteMovieIds.length < step.minPick) {
            setError(`Pick at least ${step.minPick} title${step.minPick > 1 ? 's' : ''}`);
            return;
        }
        setError('');
        onNext();
    };

    const countSwipeRatings = useCallback((ratings) => (
        Object.values(ratings || {}).filter(
            (r) => r && r !== 'havent_watched' && r !== 'skip',
        ).length
    ), []);

    const ratedSwipeCount = useMemo(
        () => countSwipeRatings(state.swipeRatings),
        [state.swipeRatings, countSwipeRatings],
    );

    const [queueIdx, setQueueIdx] = useState(0);
    const prevActiveStepRef = React.useRef(null);

    const findNextMovieIdx = useCallback((startIdx, ratings) => {
        for (let i = startIdx; i < moviePool.length; i += 1) {
            const id = String(moviePool[i].tmdb_id || moviePool[i].id);
            if (!ratings[id]) return i;
        }
        return moviePool.length;
    }, [moviePool]);

    useEffect(() => {
        if (activeStepId === 'swipe-reactions' && prevActiveStepRef.current !== 'swipe-reactions') {
            setQueueIdx(findNextMovieIdx(0, stateRef.current.swipeRatings));
        }
        prevActiveStepRef.current = activeStepId;
    }, [activeStepId, findNextMovieIdx]);

    const currentSwipe = moviePool[queueIdx];

    useEffect(() => {
        if (activeStepId !== 'swipe-reactions') return undefined;
        if (queueIdx >= moviePool.length - 5 && moviePool.length > 0 && onRequestMoreMovies) {
            onRequestMoreMovies();
        }
        return undefined;
    }, [activeStepId, queueIdx, moviePool.length, onRequestMoreMovies]);

    useEffect(() => {
        if (activeStepId !== 'swipe-reactions') return undefined;
        if (!moviePool[queueIdx] && moviePool.length > 0) {
            const next = findNextMovieIdx(0, stateRef.current.swipeRatings);
            if (next < moviePool.length) {
                setQueueIdx(next);
                setError('');
            }
        }
        return undefined;
    }, [moviePool, queueIdx, activeStepId, findNextMovieIdx, setError]);

    const advanceAfterSwipe = useCallback((nextRatings, newRatedCount) => {
        if (newRatedCount >= SWIPE_RATING_TARGET) {
            onNext();
            return;
        }
        const nextIdx = findNextMovieIdx(queueIdx + 1, nextRatings);
        if (nextIdx >= moviePool.length) {
            if (onRequestMoreMovies) onRequestMoreMovies();
            setError('Loading more titles for you…');
            return;
        }
        setError('');
        setQueueIdx(nextIdx);
    }, [findNextMovieIdx, queueIdx, moviePool.length, onNext, onRequestMoreMovies, setError]);

    const recordSwipe = (reaction) => {
        if (!currentSwipe) return;
        const id = String(currentSwipe.tmdb_id || currentSwipe.id);

        if (reaction === 'havent_watched') {
            advanceAfterSwipe(state.swipeRatings, ratedSwipeCount);
            return;
        }

        const nextRatings = { ...state.swipeRatings, [id]: reaction };
        const newRatedCount = countSwipeRatings(nextRatings);
        setField({
            swipeRatings: nextRatings,
            seedRatings: { ...state.seedRatings, [id]: reaction },
        });
        advanceAfterSwipe(nextRatings, newRatedCount);
    };

    switch (step.type) {
    case 'welcome':
        return (
            <>
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="text-6xl mb-6 animate-pulse">🎬</div>
                    <CinematicTitle
                        title={step.title}
                        subtitle={step.subtitle}
                    />
                    <p className="text-white/40 text-sm max-w-xs">
                        A premium taste profile in minutes — curated like a film festival, powered by AI.
                    </p>
                </div>
                <CinematicCTA
                    onPrimary={handleContinue}
                    showBack={false}
                    primaryLabel="Begin your profile →"
                />
            </>
        );

    case 'ai-intro':
        return (
            <>
                <div className="flex-1 py-6">
                    <CinematicTitle title={step.title} subtitle={step.subtitle} />
                    <div className="space-y-4 mt-8">
                        {[
                            { icon: '🧠', text: 'I learn from every movie you love, skip, or react to.' },
                            { icon: '📈', text: 'Your taste profile evolves — smarter picks over time.' },
                            { icon: '🎯', text: 'Recommendations filtered by your streaming platforms.' },
                        ].map((line, i) => (
                            <div
                                key={line.text}
                                className="flex gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/10 animate-fade-in"
                                style={{ animationDelay: `${i * 200}ms` }}
                            >
                                <span className="text-2xl">{line.icon}</span>
                                <p className="text-sm text-white/70 text-left leading-relaxed">{line.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} primaryLabel="Meet my AI →" />
            </>
        );

    case 'identity':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                <div className="space-y-4 text-left flex-1">
                    <div>
                        <label className="text-xs text-white/40 mb-1 block">Username</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40">@</span>
                            <input
                                type="text"
                                value={state.username}
                                onChange={(e) => {
                                    const v = e.target.value.toLowerCase();
                                    if (v === '' || /^[a-z0-9_]+$/.test(v)) setField({ username: v });
                                }}
                                maxLength={20}
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
                            value={state.dateOfBirth}
                            onChange={(e) => setField({ dateOfBirth: e.target.value })}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-white/40 mb-2 block">Region</label>
                        <div className="flex flex-wrap gap-2">
                            {REGIONS.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setField({ region: r.id, streamingServices: [] })}
                                    className={`px-3 py-2 rounded-lg text-sm border ${
                                        state.region === r.id
                                            ? 'border-orange-500 bg-orange-500/20 text-white'
                                            : 'border-white/10 bg-white/5 text-white/60'
                                    }`}
                                >
                                    {r.flag} {r.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-white/40 mb-2 block">Avatar</label>
                        <div className="grid grid-cols-6 gap-2">
                            {AVATARS.map((avatar) => (
                                <button
                                    key={avatar.id}
                                    type="button"
                                    onClick={() => setField({ selectedAvatar: avatar.id })}
                                    className={`aspect-square rounded-xl bg-gradient-to-br ${avatar.bg} flex items-center justify-center text-xl ${
                                        state.selectedAvatar === avatar.id ? 'ring-2 ring-orange-500 scale-105' : 'opacity-70'
                                    }`}
                                >
                                    {avatar.emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
                <CinematicCTA
                    onPrimary={handleContinue}
                    onSecondary={onBack}
                    primaryDisabled={checkingUsername || usernameAvailable === false}
                />
            </>
        );

    case 'favorite-movies':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={`${step.subtitle} (${state.favoriteMovieIds.length}/${step.maxPick})`} align="left" />
                {loadingMovies ? (
                    <p className="text-center text-white/50 py-12">Loading posters…</p>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 flex-1 max-h-[50vh] overflow-y-auto pr-1">
                        {moviePool.slice(0, 24).map((movie) => {
                            const id = String(movie.tmdb_id || movie.id);
                            const selected = state.favoriteMovieIds.includes(id);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setField({
                                        favoriteMovieIds: toggleListItem(
                                            state.favoriteMovieIds,
                                            id,
                                            step.maxPick,
                                        ),
                                    })}
                                    className={`relative rounded-xl overflow-hidden border aspect-[2/3] ${
                                        selected ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-white/10'
                                    }`}
                                >
                                    <img
                                        src={posterUrl(movie.poster_path, 'w342') || '/placeholder.png'}
                                        alt=""
                                        className="w-full h-full object-cover"
                                    />
                                    {selected && (
                                        <div className="absolute inset-0 bg-orange-500/25 flex items-center justify-center text-2xl">❤️</div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
                {error && <p className="text-red-400 text-sm text-center mt-2">{error}</p>}
                <CinematicCTA
                    onPrimary={handleContinue}
                    onSecondary={onBack}
                    onSkip={onSkip}
                    showSkip
                />
            </>
        );

    case 'swipe-reactions':
        return (
            <>
                <CinematicTitle
                    title={step.title}
                    subtitle={`${ratedSwipeCount} of ${SWIPE_RATING_TARGET} rated — "Haven't watched" shows another film`}
                    align="left"
                />
                {loadingMovies || !currentSwipe ? (
                    <p className="text-center text-white/50 py-12">
                        {loadingMovies ? 'Loading films…' : 'Fetching more titles…'}
                    </p>
                ) : (
                    <div className="flex-1 flex flex-col items-center">
                        <div className="w-full max-w-xs h-1 rounded-full bg-white/10 mb-4 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300"
                                style={{ width: `${(ratedSwipeCount / SWIPE_RATING_TARGET) * 100}%` }}
                            />
                        </div>
                        <div className="relative w-48 sm:w-56 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10 mb-6">
                            <img
                                src={posterUrl(currentSwipe.poster_path, 'w500') || '/placeholder.png'}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                                <p className="text-white font-semibold text-sm truncate">{currentSwipe.title}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 w-full">
                            {TastePrefs.SWIPE_REACTIONS.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => recordSwipe(r.id)}
                                    className={`py-3 px-2 rounded-2xl border border-white/10 bg-gradient-to-br ${r.color} text-white text-sm font-medium`}
                                >
                                    {r.emoji} {r.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {error && <p className="text-amber-400/90 text-sm text-center mt-2">{error}</p>}
                <CinematicCTA
                    onPrimary={() => {}}
                    onSecondary={onBack}
                    showBack
                    showSkip={false}
                    primaryLabel={`Rate ${SWIPE_RATING_TARGET} films to continue (${ratedSwipeCount}/${SWIPE_RATING_TARGET})`}
                    primaryDisabled
                />
            </>
        );

    case 'multi-select': {
        const options = getOptions(step.optionsKey);
        const selected = state[step.stateKey] || [];
        return (
            <>
                <CinematicTitle
                    title={step.title}
                    subtitle={step.maxPick ? `${step.subtitle} (up to ${step.maxPick})` : step.subtitle}
                    align="left"
                />
                {step.optionsKey === 'DIRECTOR_OPTIONS' ? (
                    <DirectorGrid
                        options={options}
                        selected={selected}
                        maxPick={step.maxPick}
                        onToggle={(id) => setField({
                            [step.stateKey]: toggleListItem(selected, id, step.maxPick),
                        })}
                    />
                ) : (
                    <OptionGrid
                        options={options}
                        selected={selected}
                        multi
                        onToggle={(id) => setField({
                            [step.stateKey]: toggleListItem(selected, id, step.maxPick),
                        })}
                    />
                )}
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} onSkip={onSkip} showSkip />
            </>
        );
    }

    case 'single-select': {
        const options = getOptions(step.optionsKey);
        const selected = state[step.stateKey];
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                <OptionGrid
                    options={options}
                    selected={selected}
                    multi={false}
                    columns={1}
                    onToggle={(id) => setField({ [step.stateKey]: selected === id ? null : id })}
                />
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} onSkip={onSkip} showSkip />
            </>
        );
    }

    case 'mood-vibe':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                <p className="text-xs text-orange-400/80 mb-2 font-medium">Genres (up to {MAX_GENRE_PICKS})</p>
                <div className="flex flex-wrap gap-2 mb-5 max-h-32 overflow-y-auto">
                    {MOVIE_GENRES.map((g) => {
                        const selected = state.genreIds.includes(g.id);
                        return (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => setField({
                                    genreIds: toggleListItem(state.genreIds, g.id, MAX_GENRE_PICKS),
                                })}
                                className={`px-3 py-1.5 rounded-full text-sm border ${
                                    selected ? 'border-orange-500 bg-orange-500/20 text-white' : 'border-white/10 text-white/60'
                                }`}
                            >
                                {GENRE_EMOJI[g.id] || '🎬'} {g.name}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-orange-400/80 mb-2 font-medium">Moods</p>
                <OptionGrid
                    options={MOOD_OPTIONS}
                    selected={state.moodIds}
                    onToggle={(id) => setField({
                        moodIds: toggleListItem(state.moodIds, id, MAX_MOOD_PICKS),
                    })}
                />
                <p className="text-xs text-orange-400/80 mb-2 mt-4 font-medium">Personality vibes</p>
                <OptionGrid
                    options={TastePrefs.VIBE_PERSONALITY_OPTIONS}
                    selected={state.vibeIds}
                    onToggle={(id) => setField({
                        vibeIds: toggleListItem(state.vibeIds, id, 4),
                    })}
                />
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} onSkip={onSkip} showSkip />
            </>
        );

    case 'ott':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                <OptionGrid
                    options={streamingOptions.map((s) => ({ ...s, description: null }))}
                    selected={state.streamingServices}
                    onToggle={(id) => setField({
                        streamingServices: toggleListItem(state.streamingServices, id, 99),
                    })}
                />
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} onSkip={onSkip} showSkip skipLabel="Skip — add later" />
            </>
        );

    case 'viewing-context':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                <OptionGrid
                    options={TastePrefs.VIEWING_CONTEXT_OPTIONS}
                    selected={state.viewingContext}
                    onToggle={(id) => setField({
                        viewingContext: toggleListItem(state.viewingContext, id, 3),
                    })}
                />
                <button
                    type="button"
                    onClick={() => setField({ familyModeEnabled: !state.familyModeEnabled })}
                    className={`w-full mt-4 p-4 rounded-2xl border text-left ${
                        state.familyModeEnabled ? 'border-orange-500 bg-orange-500/15' : 'border-white/10 bg-white/5'
                    }`}
                >
                    <p className="text-white font-medium">👨‍👩‍👧 Family-safe mode</p>
                    <p className="text-xs text-white/50 mt-1">Filter recommendations by certification</p>
                </button>
                {state.familyModeEnabled && (
                    <div className="space-y-2 mt-3">
                        {certificationOptions.map((cert) => (
                            <button
                                key={cert.id}
                                type="button"
                                onClick={() => setField({ familyMaxCertification: cert.id })}
                                className={`w-full p-3 rounded-xl border text-left ${
                                    state.familyMaxCertification === cert.id
                                        ? 'border-orange-500 bg-orange-500/15'
                                        : 'border-white/10 bg-white/5'
                                }`}
                            >
                                <p className="text-sm text-white">{cert.label}</p>
                            </button>
                        ))}
                    </div>
                )}
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} onSkip={onSkip} showSkip />
            </>
        );

    case 'deep-gate':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} />
                <div className="grid grid-cols-1 gap-3 flex-1">
                    <button
                        type="button"
                        onClick={() => { setField({ deepCalibrationEnabled: true }); onNext(); }}
                        className="p-5 rounded-2xl border border-orange-500/50 bg-orange-500/10 text-left"
                    >
                        <p className="text-white font-semibold">Yes — go deeper 🎞️</p>
                        <p className="text-sm text-white/50 mt-1">Directors, visuals, soundtrack calibration</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setField({ deepCalibrationEnabled: false }); onNext(); }}
                        className="p-5 rounded-2xl border border-white/10 bg-white/5 text-left"
                    >
                        <p className="text-white font-semibold">Skip for now</p>
                        <p className="text-sm text-white/50 mt-1">You can fine-tune anytime from your profile</p>
                    </button>
                </div>
                <CinematicCTA onPrimary={() => {}} onSecondary={onBack} showBack primaryLabel="Choose above ↑" primaryDisabled />
            </>
        );

    case 'generating':
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                <div className="w-20 h-20 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin mb-8" />
                <CinematicTitle title={step.title} subtitle={AI_MESSAGES[aiMsgIdx]} />
                <div className="w-full max-w-xs h-1.5 rounded-full bg-white/10 mt-6 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-[1100ms] ease-out"
                        style={{ width: generatingDone ? '100%' : '70%' }}
                    />
                </div>
                <p className="text-[11px] text-white/30 mt-4 max-w-xs">
                    Syncing your taste signals locally — full AI embeddings arrive in a future update.
                </p>
            </div>
        );

    case 'taste-identity': {
        const identity = state.tasteIdentity || generateTasteIdentity(state);
        return (
            <>
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-orange-400/80 mb-3">Your taste identity</p>
                    <h2 className="text-3xl font-bold text-white mb-3">{identity.title}</h2>
                    <p className="text-white/55 text-sm max-w-sm leading-relaxed">{identity.summary}</p>
                    <div className="mt-8 p-4 rounded-2xl bg-white/[0.04] border border-white/10 w-full">
                        <p className="text-xs text-white/40 mb-2">Profile signals</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {state.genreIds.slice(0, 3).map((id) => {
                                const g = MOVIE_GENRES.find((x) => x.id === id);
                                return g ? (
                                    <span key={id} className="px-2 py-1 rounded-full bg-orange-500/15 text-xs text-orange-200">{g.name}</span>
                                ) : null;
                            })}
                            {state.emotionalTastes.slice(0, 2).map((id) => (
                                <span key={id} className="px-2 py-1 rounded-full bg-white/10 text-xs text-white/70">{id}</span>
                            ))}
                        </div>
                    </div>
                </div>
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} primaryLabel="See my first pick →" />
            </>
        );
    }

    case 'first-recommendation':
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} align="left" />
                {recommendation ? (
                    <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
                        <img
                            src={posterUrl(recommendation.poster_path, 'w342') || '/placeholder.png'}
                            alt=""
                            className="w-24 aspect-[2/3] object-cover rounded-xl"
                        />
                        <div className="flex-1 min-w-0 text-left">
                            <p className="text-lg font-bold text-white truncate">{recommendation.title}</p>
                            <p className="text-xs text-orange-400/90 mt-2 leading-relaxed">
                                {buildRecommendationReason(state, recommendation)}
                            </p>
                            {state.streamingServices.length > 0 && (
                                <p className="text-[11px] text-white/40 mt-2">
                                    Check OTT on your platforms: {state.streamingServices.slice(0, 2).join(', ')}
                                    {state.streamingServices.length > 2 ? '…' : ''}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className="text-white/50 text-center py-8">We will personalize picks as you explore.</p>
                )}
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} primaryLabel="Explore TOS →" />
            </>
        );

    case 'feature-intro':
        return (
            <>
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                    <span className="text-5xl mb-4">{step.icon}</span>
                    <CinematicTitle title={step.title} subtitle={step.subtitle} />
                    <ul className="text-left space-y-2 mt-4 w-full max-w-sm">
                        {step.bullets?.map((b) => (
                            <li key={b} className="flex gap-2 text-sm text-white/60">
                                <span className="text-orange-400">•</span>
                                {b}
                            </li>
                        ))}
                    </ul>
                </div>
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} />
            </>
        );

    case 'completion':
        return (
            <>
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="text-6xl mb-4">✨</div>
                    <CinematicTitle title={step.title} subtitle={step.subtitle} />
                    {state.tasteIdentity && (
                        <p className="text-orange-300/90 text-sm mt-2">
                            Welcome, {state.tasteIdentity.title}
                        </p>
                    )}
                </div>
                <CinematicCTA
                    onPrimary={onFinish}
                    onSecondary={onBack}
                    loading={loading}
                    primaryLabel="Enter TheaterOrStream 🎬"
                    showBack={false}
                />
            </>
        );

    default:
        return (
            <>
                <CinematicTitle title={step.title} subtitle={step.subtitle} />
                <CinematicCTA onPrimary={handleContinue} onSecondary={onBack} />
            </>
        );
    }
}
