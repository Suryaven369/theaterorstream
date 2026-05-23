import React from 'react';
import { getPhaseProgress } from '../../constants/onboardingSteps';

export function OnboardingPhaseProgress({ stepId, ctx }) {
    const { phaseLabel, progress, stepNum, total } = getPhaseProgress(stepId, ctx);

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between text-[11px] text-white/40 mb-2">
                <span>{phaseLabel}</span>
                <span>{stepNum} / {total}</span>
            </div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

export { posterUrl } from './OnboardingUI';
