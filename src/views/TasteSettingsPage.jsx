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
        <section className="mb-8">
            <h2 className="mb-3 text-base font-semibold text-white">{title}</h2>
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                    const key = getKey(opt);
                    const active = selected.includes(key);
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onToggle(key)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
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
            // Show the confirmation briefly, then return to the previous page.
            setTimeout(() => {
                if (window.history.length > 1) navigate(-1);
                else navigate('/watch');
            }, 700);
        } else {
            setError(res?.error || 'Could not save. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-primary)] px-4 pb-28 pt-24 sm:px-8 lg:pb-12">
            <div className="mx-auto max-w-3xl">
                <Link to="/watch" className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white">
                    <FaArrowLeft /> Back to Watch
                </Link>

                <div className="mb-2">
                    <h1 className="text-2xl font-bold text-white sm:text-3xl">
                        Taste <span className="text-gradient">Preferences</span>
                    </h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Optional. Fine-tune your recommendations — everything here is a starting point.
                    </p>
                </div>

                <div className="mb-8 flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
                    <FaInfoCircle className="mt-0.5 shrink-0 text-[var(--accent-green)]" />
                    <p>
                        Taste is driven by what you like and rate. Marking a film watched only hides it
                        from recommendations — it does not mean you loved it. These prefs nudge the engine
                        until you have enough likes and ratings.
                    </p>
                </div>

                {loading ? (
                    <div className="space-y-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-24 animate-pulse rounded-xl skeleton" />
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

                        <div className="sticky bottom-4 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="btn-primary disabled:opacity-60"
                            >
                                {saving ? 'Saving…' : 'Save preferences'}
                            </button>
                            {savedAt && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--accent-green)]">
                                    <FaCheck /> Saved
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
