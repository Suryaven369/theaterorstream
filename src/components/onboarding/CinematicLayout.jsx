import React from 'react';

const VARIANTS = {
    default: {
        a: 'from-violet-950/80 via-[#050508] to-[#050508]',
        b: 'bg-[radial-gradient(ellipse_80%_50%_at_20%_0%,rgba(249,115,22,0.18),transparent_60%)]',
        c: 'bg-[radial-gradient(ellipse_60%_40%_at_90%_20%,rgba(59,130,246,0.12),transparent_55%)]',
    },
    ai: {
        a: 'from-indigo-950/90 via-[#050508] to-[#050508]',
        b: 'bg-[radial-gradient(ellipse_70%_50%_at_50%_30%,rgba(99,102,241,0.22),transparent_65%)]',
        c: 'bg-[radial-gradient(ellipse_50%_40%_at_80%_80%,rgba(168,85,247,0.15),transparent_60%)]',
    },
    complete: {
        a: 'from-amber-950/70 via-[#050508] to-[#050508]',
        b: 'bg-[radial-gradient(ellipse_80%_55%_at_50%_40%,rgba(251,191,36,0.2),transparent_70%)]',
        c: 'bg-[radial-gradient(ellipse_40%_30%_at_20%_90%,rgba(249,115,22,0.12),transparent_60%)]',
    },
};

export function CinematicLayout({ children, variant = 'default' }) {
    const v = VARIANTS[variant] || VARIANTS.default;

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#050508]">
            <div className={`absolute inset-0 bg-gradient-to-b ${v.a} pointer-events-none`} />
            <div className={`absolute inset-0 ${v.b} pointer-events-none animate-pulse`} style={{ animationDuration: '8s' }} />
            <div className={`absolute inset-0 ${v.c} pointer-events-none`} />
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.04]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 3px)',
                }}
            />
            <div className="relative z-10 min-h-full flex flex-col px-4 pt-6 pb-10 max-w-lg mx-auto">
                {children}
            </div>
        </div>
    );
}

export function CinematicTitle({ title, subtitle, align = 'center' }) {
    return (
        <div className={`mb-6 ${align === 'center' ? 'text-center' : 'text-left'}`}>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">{title}</h1>
            {subtitle && <p className="text-sm text-white/50 leading-relaxed">{subtitle}</p>}
        </div>
    );
}

export function CinematicCTA({
    onPrimary,
    onSecondary,
    onSkip,
    primaryLabel = 'Continue',
    secondaryLabel = 'Back',
    skipLabel = 'Skip for now',
    primaryDisabled = false,
    loading = false,
    showSkip = false,
    showBack = true,
}) {
    return (
        <div className="mt-auto pt-6 space-y-3">
            <div className="flex gap-3">
                {showBack && onSecondary && (
                    <button
                        type="button"
                        onClick={onSecondary}
                        className="flex-1 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors"
                    >
                        {secondaryLabel}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onPrimary}
                    disabled={primaryDisabled || loading}
                    className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold disabled:opacity-45 transition-opacity shadow-lg shadow-orange-500/20"
                >
                    {loading ? 'Saving…' : primaryLabel}
                </button>
            </div>
            {showSkip && onSkip && (
                <button type="button" onClick={onSkip} className="w-full text-sm text-white/35 hover:text-white/55 transition-colors">
                    {skipLabel}
                </button>
            )}
        </div>
    );
}

export function OptionGrid({ options, selected, onToggle, multi = true, columns = 2 }) {
    const isSelected = (id) => (multi ? selected.includes(id) : selected === id);

    return (
        <div className={`grid gap-2 ${columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {options.map((opt) => {
                const active = isSelected(opt.id);
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggle(opt.id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                            active
                                ? 'border-orange-500/80 bg-orange-500/15 shadow-lg shadow-orange-500/10'
                                : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                    >
                        {opt.emoji && <span className="text-2xl">{opt.emoji}</span>}
                        <p className="text-sm text-white font-medium mt-1">{opt.label}</p>
                        {opt.description && (
                            <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{opt.description}</p>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export function DirectorGrid({ options, selected, onToggle, maxPick }) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
                const active = selected.includes(opt.id);
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggle(opt.id)}
                        className={`px-3 py-2 rounded-full text-sm border transition-all ${
                            active
                                ? 'border-orange-500 bg-orange-500/20 text-white'
                                : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25'
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
            {maxPick && (
                <p className="w-full text-xs text-white/35 text-center mt-2">
                    {selected.length}/{maxPick} selected
                </p>
            )}
        </div>
    );
}
