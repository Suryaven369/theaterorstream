import React from 'react';
import { ONBOARDING_TOTAL_STEPS } from '../../constants/onboarding';

export function OnboardingProgress({ step, tasteMode = false }) {
    const totalSteps = tasteMode ? 4 : ONBOARDING_TOTAL_STEPS;
    const displayStep = tasteMode ? Math.max(1, step - 1) : step;

    return (
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 px-2">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                <div key={s} className="flex items-center">
                    <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors ${
                            displayStep >= s
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                                : 'bg-white/10 text-white/40'
                        }`}
                    >
                        {displayStep > s ? '✓' : s}
                    </div>
                    {s < totalSteps && (
                        <div
                            className={`w-6 sm:w-10 h-0.5 mx-0.5 sm:mx-1 transition-colors ${
                                displayStep > s ? 'bg-orange-500' : 'bg-white/10'
                            }`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}

export function StepShell({
    title,
    subtitle,
    children,
    onBack,
    onContinue,
    onSkip,
    continueLabel = 'Continue',
    continueDisabled = false,
    loading = false,
    showSkip = false,
    skipLabel = 'Skip for now',
}) {
    return (
        <div>
            <div className="text-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">{title}</h2>
                {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
            </div>

            {children}

            <div className="flex flex-col gap-3 mt-6">
                <div className="flex gap-3">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors"
                        >
                            Back
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={continueDisabled || loading}
                        className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium disabled:opacity-50 transition-opacity"
                    >
                        {loading ? 'Saving…' : continueLabel}
                    </button>
                </div>
                {showSkip && onSkip && (
                    <button
                        type="button"
                        onClick={onSkip}
                        className="text-sm text-white/40 hover:text-white/60 transition-colors"
                    >
                        {skipLabel}
                    </button>
                )}
            </div>
        </div>
    );
}

export function posterUrl(posterPath, size = 'w342') {
    if (!posterPath) return null;
    if (posterPath.startsWith('http')) return posterPath;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
}
