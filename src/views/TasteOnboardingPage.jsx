import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import {
    StepHeader,
    MoviePickerStep,
    PlatformStep,
    ChoiceStep,
    ChipsStep,
    PeopleStep,
    CheerScreen,
} from '../components/taste/QuizSteps';
import { STARTER_MOVIES } from '../constants/starterMovies';
import {
    getTastePreferences,
    getStreamingServices,
    getQuizStarters,
    getQuizPeople,
    skipTasteQuestionnaire,
    updateTastePreferences,
} from '../lib/recommendationApi';
import { requestTasteProfileRebuild } from '../lib/tasteProfileApi';
import {
    consumeAfterTastePath,
    markTasteOnboardingResolved,
    setCachedQuestionnaireStatus,
} from '../lib/tasteOnboarding';
import {
    TasteQuizSchema,
    quizError,
    emptyQuiz,
    MIN_LOVED,
    RECOMMENDED_LOVED,
    WATCH_PATTERNS,
    DEALBREAKERS,
    RUNTIME_LIMITS,
    QUIZ_LANGUAGES,
    QUIZ_GENRES,
    QUIZ_MOODS,
    QUIZ_FORMATS,
    QUIZ_ERAS,
    QUIZ_COMPANY,
} from '../lib/tasteQuiz';
import { lovedCheer, peopleCheer, almostCheer } from '../lib/quizCompliments';
import { clearWatchSessionCache } from '../lib/watchSessionCache';
import { getUserRegionCode } from '../lib/userRegion';
import { useAuth } from '../context/AuthContext';

/**
 * The flow: 10 questions (languages first, so every later step can use them)
 * with encouragement screens in between. Cheer screens aren't counted.
 */
const FLOW = [
    { id: 'languages', question: 'Which languages do you watch movies in?', hint: 'We’ll only recommend movies in the languages you pick.' },
    { id: 'loved', question: 'Which movies did you love?', hint: `Pick at least ${MIN_LOVED}. ${RECOMMENDED_LOVED} or more makes your picks much sharper.` },
    { id: 'cheer_loved', cheer: true },
    { id: 'genres', question: 'What do you love watching most?', hint: 'Pick as many genres as you like.' },
    { id: 'people', question: 'Who are your favourites?', hint: 'Pick the actors and directors you love. We’ll find more of their best work.' },
    { id: 'cheer_people', cheer: true },
    { id: 'disliked', question: 'Seen any you didn’t like?', hint: 'Optional. It helps us steer away from what isn’t for you.' },
    { id: 'format', question: 'Movies, series, or both?', hint: 'And which eras do you enjoy most?' },
    { id: 'mood', question: 'What’s your usual movie mood?', hint: 'Pick the vibes you reach for most.' },
    { id: 'company', question: 'Who do you usually watch with?', hint: 'And when do you usually watch?' },
    { id: 'cheer_almost', cheer: true },
    { id: 'platforms', question: 'Where do you stream?', hint: 'We’ll prefer what you can actually watch. Skip if you don’t subscribe to any.' },
    { id: 'dealbreakers', question: 'Any dealbreakers?', hint: 'Optional. Movies that hit one of these are left out completely.' },
];
const QUESTIONS = FLOW.filter((s) => !s.cheer);

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function metaFrom(movie) {
    return {
        id: Number(movie.id),
        title: movie.title,
        poster: movie.poster || null,
        year: movie.year || null,
        genreIds: movie.genreIds || [],
        lang: movie.lang || null,
    };
}

const personFrom = (p) => ({ id: Number(p.id), name: p.name, photo: p.photo || null });

export default function TasteOnboardingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const fromSettings = new URLSearchParams(location.search).get('from') === 'settings';

    const [stepIndex, setStepIndex] = useState(0);
    const [quiz, setQuiz] = useState(() => emptyQuiz(getUserRegionCode()));
    const [loved, setLoved] = useState(() => new Map());      // id → meta
    const [disliked, setDisliked] = useState(() => new Map());
    const [genres, setGenres] = useState([]);
    const [moods, setMoods] = useState([]);
    const [eras, setEras] = useState([]);
    const [company, setCompany] = useState([]);
    const [actors, setActors] = useState(() => new Map());    // id → { id, name, photo }
    const [directors, setDirectors] = useState(() => new Map());
    const [starters, setStarters] = useState({ key: '', list: [], loading: false });
    const [people, setPeople] = useState({ key: '', actors: [], directors: [], loading: false });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const step = FLOW[stepIndex];
    const lastStep = stepIndex === FLOW.length - 1;
    const questionIndex = step.cheer ? -1 : QUESTIONS.findIndex((q) => q.id === step.id);
    const progress = ((stepIndex + 1) / FLOW.length) * 100;

    // Prefill: saved answers + saved streaming services.
    useEffect(() => {
        let alive = true;
        Promise.all([getTastePreferences(), getStreamingServices()]).then(([prefs, streaming]) => {
            if (!alive) return;
            const status = prefs?.questionnaire?.status;
            if (!fromSettings && (status === 'completed' || status === 'skipped')) {
                markTasteOnboardingResolved();
                if (user?.id) setCachedQuestionnaireStatus(user.id, status);
                navigate(consumeAfterTastePath(), { replace: true });
                return;
            }
            const saved = prefs?.quiz;
            const meta = new Map((saved?.picks || []).map((p) => [Number(p.id), p]));
            STARTER_MOVIES.forEach((m) => { if (!meta.has(m.id)) meta.set(m.id, metaFrom(m)); });
            const lookup = (id) => meta.get(Number(id)) || { id: Number(id), title: `Movie ${id}`, poster: null };
            setLoved(new Map((saved?.lovedIds || []).map((id) => [Number(id), lookup(id)])));
            setDisliked(new Map((saved?.dislikedIds || []).map((id) => [Number(id), lookup(id)])));
            const manual = prefs?.manual || {};
            setGenres((manual.genres || []).map(Number).filter((id) => QUIZ_GENRES.some((g) => g.id === id)));
            setMoods((manual.moods || []).filter((id) => QUIZ_MOODS.some((m) => m.id === id)));
            setEras((manual.eras || []).map(Number).filter((id) => QUIZ_ERAS.some((e) => e.id === id)));
            setCompany(prefs?.questionnaire?.company || []);
            setActors(new Map((manual.actors || []).map((p) => [Number(p.id), personFrom(p)])));
            setDirectors(new Map((manual.directors || []).map((p) => [Number(p.id), personFrom(p)])));
            setQuiz({
                ...emptyQuiz(streaming?.hasServices ? streaming.region : getUserRegionCode()),
                ...(saved || {}),
                region: streaming?.hasServices ? streaming.region : (saved?.region || getUserRegionCode()),
                platformIds: streaming?.hasServices ? streaming.providerIds : (saved?.platformIds || []),
                languages: (saved?.languages || manual.languages || []).filter((l) => QUIZ_LANGUAGES.some((q) => q.id === l)),
                format: saved?.format || null,
                dealbreakers: (saved?.dealbreakers || []).filter((d) => d !== 'subtitles'),
            });
            setLoading(false);
        });
        return () => { alive = false; };
    }, [fromSettings, navigate, user?.id]);

    // Starter films in the picked languages (for the loved / disliked steps).
    const langKey = [...quiz.languages].sort().join(',');
    useEffect(() => {
        if (!['loved', 'disliked'].includes(step.id) || !langKey || starters.key === langKey) return undefined;
        let alive = true;
        setStarters({ key: langKey, list: [], loading: true });
        getQuizStarters(langKey.split(',')).then((list) => {
            if (!alive) return;
            const langs = langKey.split(',');
            const fallback = STARTER_MOVIES.filter((m) => langs.includes(m.lang));
            setStarters({ key: langKey, list: list.length ? list : fallback, loading: false });
        });
        return () => { alive = false; };
    }, [step.id, langKey, starters.key]);

    // Actor / director suggestions from loved films + languages.
    const lovedKey = [...loved.keys()].slice(0, 8).join(',');
    const peopleKey = `${langKey}|${lovedKey}`;
    useEffect(() => {
        if (step.id !== 'people' || people.key === peopleKey) return undefined;
        let alive = true;
        setPeople({ key: peopleKey, actors: [], directors: [], loading: true });
        getQuizPeople(langKey ? langKey.split(',') : [], lovedKey ? lovedKey.split(',') : []).then((res) => {
            if (!alive) return;
            // Keep earlier favourites visible even if they aren't suggested now.
            const merge = (list, chosen) => [...list, ...[...chosen.values()].filter((p) => !list.some((x) => Number(x.id) === p.id))];
            setPeople({ key: peopleKey, actors: merge(res.actors, actors), directors: merge(res.directors, directors), loading: false });
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.id, peopleKey]);

    const payload = useMemo(() => ({
        ...quiz,
        format: quiz.format || 'both',
        lovedIds: [...loved.keys()],
        dislikedIds: [...disliked.keys()],
        picks: [...loved.values(), ...disliked.values()].map(metaFrom),
    }), [quiz, loved, disliked]);

    const peopleOffered = people.actors.length + people.directors.length > 0;

    // Per-step gate: every question needs an answer (dislikes, services and
    // dealbreakers can honestly be "none").
    const stepBlocker = (() => {
        switch (step.id) {
            case 'languages': return quiz.languages.length ? null : 'Pick at least one language';
            case 'loved':
                return loved.size < MIN_LOVED
                    ? `Pick ${MIN_LOVED - loved.size} more movie${MIN_LOVED - loved.size === 1 ? '' : 's'} you loved`
                    : null;
            case 'genres': return genres.length ? null : 'Pick at least one genre';
            case 'people':
                return !people.loading && peopleOffered && !actors.size && !directors.size
                    ? 'Pick at least one actor or director'
                    : null;
            case 'format':
                if (!quiz.format) return 'Choose movies, series or both';
                return eras.length ? null : 'Pick at least one era';
            case 'mood': return moods.length ? null : 'Pick at least one mood';
            case 'company':
                if (!company.length) return 'Tell us who you watch with';
                return quiz.pattern ? null : 'Choose when you usually watch';
            default: return null;
        }
    })();

    const leave = (status) => {
        markTasteOnboardingResolved();
        if (user?.id && status) setCachedQuestionnaireStatus(user.id, status);
        navigate(fromSettings ? '/settings/taste' : consumeAfterTastePath(), { replace: true });
    };

    const handleSkip = async () => {
        if (fromSettings) { navigate('/settings/taste', { replace: true }); return; }
        setSaving(true);
        await skipTasteQuestionnaire();
        setSaving(false);
        leave('skipped');
    };

    const handleSave = async () => {
        const parsed = TasteQuizSchema.safeParse(payload);
        if (!parsed.success) { setError(quizError(parsed)); return; }
        setSaving(true);
        setError(null);
        const res = await updateTastePreferences({
            quiz: parsed.data,
            questionnaireStatus: 'completed',
            languages: parsed.data.languages,
            genres,
            moods,
            eras,
            company,
            actors: [...actors.values()].map(({ id, name }) => ({ id, name })),
            directors: [...directors.values()].map(({ id, name }) => ({ id, name })),
        });
        setSaving(false);
        if (res?.ok) {
            // Picks were rebuilt server-side; drop anything this tab still holds.
            clearWatchSessionCache();
            requestTasteProfileRebuild();
            leave('completed');
        } else {
            setError(res?.error || 'Could not save. Please try again.');
        }
    };

    const handleNext = () => {
        if (stepBlocker) { setError(stepBlocker); return; }
        setError(null);
        if (lastStep) handleSave();
        else {
            setStepIndex((i) => i + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const toggleMovie = (setter, otherSetter) => (movie) => {
        const id = Number(movie.id);
        setter((prev) => {
            const next = new Map(prev);
            if (next.has(id)) next.delete(id); else next.set(id, metaFrom(movie));
            return next;
        });
        otherSetter((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
        setError(null);
    };

    const togglePerson = (setter) => (person) => {
        const id = Number(person.id);
        setter((prev) => {
            const next = new Map(prev);
            if (next.has(id)) next.delete(id); else next.set(id, personFrom(person));
            return next;
        });
        setError(null);
    };

    const cheer = step.id === 'cheer_loved'
        ? lovedCheer({ loved: [...loved.values()], languages: quiz.languages })
        : step.id === 'cheer_people'
            ? peopleCheer({ actors: [...actors.values()], directors: [...directors.values()], genres })
            : step.id === 'cheer_almost'
                ? almostCheer({ moods, company })
                : null;

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:px-8 sm:pt-10">
            <SeoHead title="Your taste · TheaterOrStream" description="A few quick questions so every pick fits you." />
            <div className="mx-auto flex max-w-2xl flex-col">
                <div className="mb-5 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-tight">
                        <span className="text-[var(--color-theater)]">Theater</span>
                        <span className="text-white/40"> or Stream</span>
                    </p>
                    <button type="button" onClick={handleSkip} disabled={saving} className="min-h-[40px] text-sm text-white/45 hover:text-white disabled:opacity-50">
                        Skip for now
                    </button>
                </div>
                <div className="mb-5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[var(--primary)] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>

                {loading ? (
                    <div className="space-y-4">
                        <div className="h-8 w-2/3 animate-pulse rounded-lg skeleton" />
                        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-lg skeleton" />)}
                        </div>
                    </div>
                ) : (
                    <>
                        {cheer ? <CheerScreen {...cheer} /> : (
                            <StepHeader index={questionIndex} total={QUESTIONS.length} question={step.question} hint={step.hint} />
                        )}

                        {step.id === 'languages' && (
                            <ChipsStep
                                options={QUIZ_LANGUAGES}
                                values={quiz.languages}
                                onToggle={(id) => { setQuiz((q) => ({ ...q, languages: toggle(q.languages, id) })); setError(null); }}
                            />
                        )}
                        {step.id === 'loved' && (
                            <MoviePickerStep
                                selected={loved}
                                onToggle={toggleMovie(setLoved, setDisliked)}
                                tone="love"
                                starters={starters.list}
                                startersLoading={starters.loading}
                                requiredHint={`${loved.size} picked${loved.size < MIN_LOVED ? ` · ${MIN_LOVED - loved.size} more to go` : loved.size < RECOMMENDED_LOVED ? ' · a couple more makes picks sharper' : ' · great'}`}
                            />
                        )}
                        {step.id === 'genres' && (
                            <ChipsStep options={QUIZ_GENRES} values={genres} onToggle={(id) => { setGenres((g) => toggle(g, id)); setError(null); }} />
                        )}
                        {step.id === 'people' && (
                            <PeopleStep
                                options={people}
                                loading={people.loading}
                                selectedActors={actors}
                                selectedDirectors={directors}
                                onToggleActor={togglePerson(setActors)}
                                onToggleDirector={togglePerson(setDirectors)}
                            />
                        )}
                        {step.id === 'disliked' && (
                            <MoviePickerStep
                                selected={disliked}
                                onToggle={toggleMovie(setDisliked, setLoved)}
                                exclude={[...loved.keys()]}
                                tone="dislike"
                                starters={starters.list}
                                startersLoading={starters.loading}
                            />
                        )}
                        {step.id === 'format' && (
                            <div className="space-y-5">
                                <ChoiceStep options={QUIZ_FORMATS} value={quiz.format} onChange={(format) => { setQuiz((q) => ({ ...q, format })); setError(null); }} />
                                <div>
                                    <p className="mb-2 text-[13px] font-medium text-white/70">Favourite eras</p>
                                    <ChipsStep options={QUIZ_ERAS} values={eras} onToggle={(id) => { setEras((e) => toggle(e, id)); setError(null); }} />
                                </div>
                            </div>
                        )}
                        {step.id === 'mood' && (
                            <ChipsStep options={QUIZ_MOODS} values={moods} onToggle={(id) => { setMoods((m) => toggle(m, id)); setError(null); }} />
                        )}
                        {step.id === 'company' && (
                            <div className="space-y-5">
                                <ChipsStep options={QUIZ_COMPANY} values={company} onToggle={(id) => { setCompany((c) => toggle(c, id)); setError(null); }} />
                                <div>
                                    <p className="mb-2 text-[13px] font-medium text-white/70">When do you usually watch?</p>
                                    <ChoiceStep options={WATCH_PATTERNS} value={quiz.pattern} onChange={(pattern) => { setQuiz((q) => ({ ...q, pattern })); setError(null); }} />
                                </div>
                            </div>
                        )}
                        {step.id === 'platforms' && (
                            <PlatformStep
                                region={quiz.region}
                                onRegion={(region) => setQuiz((q) => ({ ...q, region, platformIds: [] }))}
                                selectedIds={quiz.platformIds}
                                onToggle={(id) => setQuiz((q) => ({ ...q, platformIds: toggle(q.platformIds, id) }))}
                            />
                        )}
                        {step.id === 'dealbreakers' && (
                            <div className="space-y-5">
                                <ChipsStep options={DEALBREAKERS} values={quiz.dealbreakers} onToggle={(id) => setQuiz((q) => ({ ...q, dealbreakers: toggle(q.dealbreakers, id) }))} />
                                <div>
                                    <p className="mb-2 text-[13px] font-medium text-white/70">How long can a movie be?</p>
                                    <ChoiceStep options={RUNTIME_LIMITS} value={quiz.maxRuntime} onChange={(maxRuntime) => setQuiz((q) => ({ ...q, maxRuntime }))} />
                                </div>
                            </div>
                        )}

                        {error && <p className="mt-4 text-sm text-red-400" role="alert">{error}</p>}
                    </>
                )}

                {/* Sits right under the answers — not pinned to the bottom of the screen. */}
                <div className="mt-6">
                    <div className="flex items-center gap-2">
                        {stepIndex > 0 && (
                            <button
                                type="button"
                                disabled={saving || loading}
                                onClick={() => { setError(null); setStepIndex((i) => i - 1); }}
                                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-sm text-white/70 hover:text-white disabled:opacity-50"
                            >
                                <FaArrowLeft className="text-[11px]" /> Back
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving || loading}
                            onClick={handleNext}
                            className={`btn-primary min-h-[46px] flex-1 disabled:opacity-60 ${stepBlocker ? 'opacity-70' : ''}`}
                        >
                            {saving ? 'Saving…' : lastStep ? 'Show my picks' : step.cheer ? 'Keep going' : 'Continue'}
                        </button>
                    </div>
                    <p className="mt-3 text-center text-[11px] text-white/35">
                        You can change this later in Settings → Taste Preferences.
                    </p>
                </div>
            </div>
        </div>
    );
}
