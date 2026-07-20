import React from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

export default function TasteMapHeader({ status, confidence, lastComputedAt }) {
    return (
        <header className="mb-5 sm:mb-8">
            <Link
                to="/profile"
                className="mb-3 inline-flex min-h-[40px] items-center gap-2 text-sm text-white/50 transition-colors hover:text-white sm:mb-5"
            >
                <FaArrowLeft className="text-xs" /> Back to profile
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <h1 className="text-[1.65rem] font-bold leading-tight tracking-tight text-white sm:text-4xl">
                        Your Taste Map
                    </h1>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-white/55 sm:mt-2 sm:text-base sm:leading-relaxed">
                        A living map of the stories, moods and cinematic experiences you connect with.
                    </p>
                </div>
                <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 sm:w-auto sm:rounded-2xl sm:px-4 sm:py-3 sm:text-right">
                    <div className="flex items-center justify-between gap-3 sm:block">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-green)] sm:text-[11px]">
                            {status}
                        </p>
                        <p className="text-lg font-bold tabular-nums text-white sm:mt-1 sm:text-2xl">
                            Confidence {confidence}%
                        </p>
                    </div>
                    {lastComputedAt && (
                        <p className="mt-1 text-[10px] text-white/35 sm:text-[11px]">
                            Updated {new Date(lastComputedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-white/40 sm:mt-3 sm:text-xs">
                Your taste keeps evolving as you rate, save and watch. 100% does not mean we know you perfectly.
            </p>
        </header>
    );
}
