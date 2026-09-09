import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import SeoHead from '../components/SeoHead';
import TasteQuestionnaire, {
    emptyTasteAnswers,
    toggleTasteAnswer,
} from '../components/taste/TasteQuestionnaire';
import { TASTE_QUESTIONNAIRE_STEPS } from '../constants/tasteOnboarding';
import {
    getTastePreferences,
    skipTasteQuestionnaire,
    updateTastePreferences,
} from '../lib/recommendationApi';
import { requestTasteProfileRebuild } from '../lib/tasteProfileApi';
import {
    consumeAfterTastePath,
    markTasteOnboardingResolved,
    setCachedQuestionnaireStatus,
} from '../lib/tasteOnboarding';
import { useAuth } from '../context/AuthContext';

function prefsToAnswers(data) {
    const next = emptyTasteAnswers();
    if (!data) return next;
    next.genres = data.manual?.genres || [];
    next.moods = data.manual?.moods || [];
    next.languages = data.manual?.languages || [];
    next.eras = data.manual?.eras || [];
    next.watchStyle = data.questionnaire?.watchStyle || null;
    next.company = data.questionnaire?.company || [];
    return next;
}

export default function TasteOnboardingPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const fromSettings = new URLSearchParams(location.search).get('from') === 'settings';

    const [stepIndex, setStepIndex] = useState(0);
    const [answers, setAnswers] = useState(emptyTasteAnswers);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const lastStep = stepIndex >= TASTE_QUESTIONNAIRE_STEPS.length - 1;
    const progress = useMemo(
        () => ((stepIndex + 1) / TASTE_QUESTIONNAIRE_STEPS.length) * 100,
        [stepIndex],
    );

    useEffect(() => {
        let alive = true;
        getTastePreferences().then((data) => {
            if (!alive) return;
            const status = data?.questionnaire?.status;
            if (!fromSettings && (status === 'completed' || status === 'skipped')) {
                markTasteOnboardingResolved();
                if (user?.id) setCachedQuestionnaireStatus(user.id, status);
                navigate(consumeAfterTastePath(), { replace: true });
                return;
            }
            setAnswers(prefsToAnswers(data));
            setLoading(false);
        });
        return () => { alive = false; };
    }, [fromSettings, navigate, user?.id]);

    const leave = (status) => {
        markTasteOnboardingResolved();
        if (user?.id && status) setCachedQuestionnaireStatus(user.id, status);
        navigate(fromSettings ? '/settings/taste' : consumeAfterTastePath(), { replace: true });
    };

    const handleSkip = async () => {
        if (fromSettings) {
            navigate('/settings/taste', { replace: true });
            return;
        }
        setSaving(true);
        setError(null);
        await skipTasteQuestionnaire();
        setSaving(false);
        leave('skipped');
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        const res = await updateTastePreferences({
            genres: answers.genres,
            moods: answers.moods,
            languages: answers.languages,
            eras: answers.eras,
            watchStyle: answers.watchStyle,
            company: answers.company,
            questionnaireStatus: 'completed',
        });
        setSaving(false);
        if (res?.ok) {
            requestTasteProfileRebuild();
            leave('completed');
        } else {
            setError(res?.error || 'Could not save. Please try again.');
        }
    };

    const handleNext = () => {
        if (lastStep) handleSave();
        else {
            setError(null);
            setStepIndex((i) => Math.min(i + 1, TASTE_QUESTIONNAIRE_STEPS.length - 1));
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-8 sm:pt-10">
            <SeoHead
                title="Your taste · TheaterOrStream"
                description="Tell us how you like to watch — no movie titles, just a few questions."
            />
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col">
                <div className="mb-6 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-tight">
                        <span className="text-[var(--color-theater)]">Theater</span>
                        <span className="text-white/40"> or Stream</span>
                    </p>
                    <button
                        type="button"
                        onClick={handleSkip}
                        disabled={saving}
                        className="min-h-[40px] text-sm text-white/45 transition-colors hover:text-white disabled:opacity-50"
                    >
                        Skip for now
                    </button>
                </div>

                <div className="mb-6 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {loading ? (
                    <div className="space-y-4">
                        <div className="h-8 w-2/3 animate-pulse rounded-lg skeleton" />
                        <div className="h-4 w-full animate-pulse rounded-lg skeleton" />
                        <div className="mt-6 flex flex-wrap gap-2">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="h-10 w-24 animate-pulse rounded-full skeleton" />
                            ))}
                        </div>
                    </div>
                ) : (
                    <TasteQuestionnaire
                        stepIndex={stepIndex}
                        answers={answers}
                        error={error}
                        onToggle={(field, value) => setAnswers((prev) => toggleTasteAnswer(prev, field, value))}
                        onSelect={(field, value) => setAnswers((prev) => ({
                            ...prev,
                            [field]: prev[field] === value ? null : value,
                        }))}
                    />
                )}

                <div className="mt-auto pt-10">
                    <p className="mb-3 text-center text-[11px] text-white/35">
                        You can finish this later in Settings → Taste Preferences.
                    </p>
                    <div className="flex items-center gap-2">
                        {stepIndex > 0 && (
                            <button
                                type="button"
                                disabled={saving || loading}
                                onClick={() => { setError(null); setStepIndex((i) => i - 1); }}
                                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-sm text-white/70 hover:text-white disabled:opacity-50"
                            >
                                <FaArrowLeft className="text-[11px]" /> Back
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving || loading}
                            onClick={handleNext}
                            className="btn-primary min-h-[48px] flex-1 disabled:opacity-60"
                        >
                            {saving ? 'Saving…' : lastStep ? 'Save my taste' : 'Continue'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
