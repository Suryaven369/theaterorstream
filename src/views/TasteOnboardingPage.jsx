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
} from '../components/taste/QuizSteps';
import { STARTER_MOVIES } from '../constants/starterMovies';
import {
    getTastePreferences,
    getStreamingServices,
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
} from '../lib/tasteQuiz';
import { getUserRegionCode } from '../lib/userRegion';
import { useAuth } from '../context/AuthContext';

const STEPS = [
    { id: 'loved', question: 'Which movies did you love?', hint: `Pick at least ${MIN_LOVED} — ${RECOMMENDED_LOVED} or more makes your picks much sharper.` },
    { id: 'disliked', question: 'Seen any you didn’t like?', hint: 'Optional — it helps us steer away from what isn’t for you.' },
    { id: 'platforms', question: 'Where do you stream?', hint: 'We only recommend what you can actually watch.' },
    { id: 'pattern', question: 'When do you usually watch?', hint: 'Shapes how long and how heavy tonight’s picks are.' },
    { id: 'languages', question: 'Which languages do you watch in?', hint: 'Include dubbed or subtitled — whatever you actually watch.' },
    { id: 'dealbreakers', question: 'Any dealbreakers?', hint: 'Movies that hit one of these are left out completely.' },
];

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function metaFrom(movie) {
    return { id: Number(movie.id), title: movie.title, poster: movie.poster || null, year: movie.year || null };
}

export default function TasteOnboardingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const fromSettings = new URLSearchParams(location.search).get('from') === 'settings';

    const [stepIndex, setStepIndex] = useState(0);
    const [quiz, setQuiz] = useState(() => emptyQuiz(getUserRegionCode()));
    const [loved, setLoved] = useState(() => new Map());      // id → meta
    const [disliked, setDisliked] = useState(() => new Map());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const step = STEPS[stepIndex];
    const lastStep = stepIndex === STEPS.length - 1;
    const progress = ((stepIndex + 1) / STEPS.length) * 100;

    // Prefill: saved quiz answers + saved streaming services.
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
            setQuiz({
                ...emptyQuiz(streaming?.hasServices ? streaming.region : getUserRegionCode()),
                ...(saved || {}),
                region: streaming?.hasServices ? streaming.region : (saved?.region || getUserRegionCode()),
                platformIds: streaming?.hasServices ? streaming.providerIds : (saved?.platformIds || []),
                languages: saved?.languages || prefs?.manual?.languages || [],
            });
            setLoading(false);
        });
        return () => { alive = false; };
    }, [fromSettings, navigate, user?.id]);

    const payload = useMemo(() => ({
        ...quiz,
        lovedIds: [...loved.keys()],
        dislikedIds: [...disliked.keys()],
        picks: [...loved.values(), ...disliked.values()].map(metaFrom),
    }), [quiz, loved, disliked]);

    // Per-step gate so people can't get to the end with an invalid profile.
    const stepBlocker = (() => {
        if (step.id === 'loved' && loved.size < MIN_LOVED) {
            return `Pick ${MIN_LOVED - loved.size} more movie${MIN_LOVED - loved.size === 1 ? '' : 's'} you loved`;
        }
        if (step.id === 'pattern' && !quiz.pattern) return 'Choose one';
        return null;
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
        const res = await updateTastePreferences({ quiz: parsed.data, questionnaireStatus: 'completed' });
        setSaving(false);
        if (res?.ok) {
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
                        <StepHeader index={stepIndex} total={STEPS.length} question={step.question} hint={step.hint} />

                        {step.id === 'loved' && (
                            <MoviePickerStep
                                selected={loved}
                                onToggle={toggleMovie(setLoved, setDisliked)}
                                tone="love"
                                requiredHint={`${loved.size} picked${loved.size < MIN_LOVED ? ` · ${MIN_LOVED - loved.size} more to go` : loved.size < RECOMMENDED_LOVED ? ' · a couple more makes picks sharper' : ' · great'}`}
                            />
                        )}
                        {step.id === 'disliked' && (
                            <MoviePickerStep
                                selected={disliked}
                                onToggle={toggleMovie(setDisliked, setLoved)}
                                exclude={[...loved.keys()]}
                                tone="dislike"
                            />
                        )}
                        {step.id === 'platforms' && (
                            <PlatformStep
                                region={quiz.region}
                                onRegion={(region) => setQuiz((q) => ({ ...q, region, platformIds: [] }))}
                                selectedIds={quiz.platformIds}
                                onToggle={(id) => setQuiz((q) => ({ ...q, platformIds: toggle(q.platformIds, id) }))}
                            />
                        )}
                        {step.id === 'pattern' && (
                            <ChoiceStep options={WATCH_PATTERNS} value={quiz.pattern} onChange={(pattern) => { setQuiz((q) => ({ ...q, pattern })); setError(null); }} />
                        )}
                        {step.id === 'languages' && (
                            <ChipsStep options={QUIZ_LANGUAGES} values={quiz.languages} onToggle={(id) => setQuiz((q) => ({ ...q, languages: toggle(q.languages, id) }))} />
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
                            {saving ? 'Saving…' : lastStep ? 'Save my taste' : 'Continue'}
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
