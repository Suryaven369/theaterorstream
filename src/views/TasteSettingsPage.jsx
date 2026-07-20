import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaInfoCircle } from 'react-icons/fa';
import {
    TASTE_GENRES, TASTE_MOODS, TASTE_LANGUAGES, TASTE_ERAS,
} from '../constants/discoveryTaste';
import { getTastePreferences, updateTastePreferences } from '../lib/recommendationApi';

function toggle(list, value) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipGroup({ title, options, selected, onToggle, getKey = (o) => o.id, getLabel = (o) => o.label }) {
    return (
        <section className="mb-6 sm:mb-8">
            <h2 className="mb-2.5 text-[15px] font-semibold text-white sm:mb-3 sm:text-base">{title}</h2>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {options.map((opt) => {
                    const key = getKey(opt);
                    const active = selected.includes(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onToggle(key)}
                            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-medium transition-all sm:min-h-0 sm:px-3.5 sm:py-1.5 sm:text-sm ${
                                active
                                    ? 'border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]'
                                    : 'border-white/12 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white'
                            }`}
                        >
                            {opt.emoji && <span>{opt.emoji}</span>}
                            {getLabel(opt)}
                            {active && <FaCheck className="text-[10px]" />}
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

/**
 * Settings → Taste Preferences.
 * Optional manual customization. Behavioural learning always takes priority;
 * these act as a baseline floor (made explicit to the user in the note below).
 */
export default function TasteSettingsPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [error, setError] = useState(null);

    const [genres, setGenres] = useState([]);
    const [moods, setMoods] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [eras, setEras] = useState([]);

    useEffect(() => {
        let alive = true;
        getTastePreferences().then((data) => {
            if (!alive) return;
            if (data?.manual) {
                setGenres(data.manual.genres || []);
                setMoods(data.manual.moods || []);
                setLanguages(data.manual.languages || []);
                setEras(data.manual.eras || []);
            }
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        const res = await updateTastePreferences({ genres, moods, languages, eras });
        setSaving(false);
        if (res?.ok) {
            setSavedAt(Date.now());
            setTimeout(() => {
                if (window.history.length > 1) navigate(-1);
                else navigate('/watch');
            }, 700);
        } else {
            setError(res?.error || 'Could not save. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(4.75rem+env(safe-area-inset-top,0px))] sm:px-8 sm:pb-12 sm:pt-24">
            <div className="mx-auto max-w-3xl">
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mb-6">
                    <Link to="/taste-map" className="inline-flex min-h-[40px] items-center gap-2 text-sm text-white/50 transition-colors hover:text-white">
                        <FaArrowLeft /> Taste Map
                    </Link>
                    <span className="text-white/20">·</span>
                    <Link to="/settings" className="inline-flex min-h-[40px] items-center text-sm text-white/50 hover:text-white">
                        Settings
                    </Link>
                </div>

                <div className="mb-2">
                    <h1 className="text-xl font-bold text-white sm:text-3xl">
                        Taste <span className="text-gradient">Preferences</span>
                    </h1>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)] sm:text-sm">
                        Optional. Fine-tune recommendations — a starting point only.
                    </p>
                </div>

                <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3 text-[11px] leading-snug text-white/55 sm:mb-8 sm:px-4 sm:text-xs">
                    <FaInfoCircle className="mt-0.5 shrink-0 text-[var(--accent-green)]" />
                    <p>
                        Taste is driven by what you like and rate. Watched alone does not mean you loved it.
                        These prefs nudge the engine until you have enough likes and ratings.
                    </p>
                </div>

                {loading ? (
                    <div className="space-y-4 sm:space-y-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-20 animate-pulse rounded-xl skeleton sm:h-24" />
                        ))}
                    </div>
                ) : (
                    <>
                        <ChipGroup title="Favorite genres" options={TASTE_GENRES} selected={genres}
                            onToggle={(id) => setGenres((p) => toggle(p, id))} />
                        <ChipGroup title="Moods you love" options={TASTE_MOODS} selected={moods}
                            onToggle={(id) => setMoods((p) => toggle(p, id))} />
                        <ChipGroup title="Languages" options={TASTE_LANGUAGES} selected={languages}
                            onToggle={(id) => setLanguages((p) => toggle(p, id))} />
                        <ChipGroup title="Preferred eras" options={TASTE_ERAS} selected={eras}
                            onToggle={(id) => setEras((p) => toggle(p, id))} />

                        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

                        <div
                            className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 border-t border-white/10 bg-[#14181c]/95 px-3 py-2.5 backdrop-blur-md lg:static lg:bottom-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
                        >
                            <div className="mx-auto flex max-w-3xl items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="btn-primary min-h-[48px] flex-1 disabled:opacity-60 lg:min-h-0 lg:flex-none"
                                >
                                    {saving ? 'Saving…' : 'Save preferences'}
                                </button>
                                {savedAt && (
                                    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-green)]">
                                        <FaCheck /> Saved
                                    </span>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
