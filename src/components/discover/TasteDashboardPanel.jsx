import React from 'react';
import { Link } from 'react-router-dom';
import { FaChartLine, FaSlidersH, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { TASTE_MOODS } from '../../constants/discoveryTaste';

const MOOD_LABEL = Object.fromEntries(TASTE_MOODS.map((m) => [m.id, m.label]));

function Bar({ label, score, accent = 'var(--primary)' }) {
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-white/80">{label}</span>
                <span className="text-white/45">{score}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, Math.min(100, score))}%`, backgroundColor: accent }}
                />
            </div>
        </div>
    );
}

/**
 * Taste Dashboard: favourite genres/moods/decades, evolving interests, and a
 * recommendation-accuracy score. Reads the dashboard rollup endpoint.
 */
export default function TasteDashboardPanel({ dashboard, loading }) {
    if (loading) {
        return (
            <div className="mx-4 h-44 animate-pulse rounded-2xl skeleton sm:mx-6" />
        );
    }
    if (!dashboard) return null;

    const {
        favoriteGenres = [], favoriteMoods = [], favoriteDecades = [],
        evolvingInterests = [], accuracyScore, tasteSummary, ratingCount, eventCount,
        evolution,
    } = dashboard;

    const hasSignal = favoriteGenres.length || ratingCount > 0 || eventCount > 0;

    return (
        <section className="mx-4 rounded-2xl border border-white/8 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-card)] p-5 sm:mx-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                    <FaChartLine className="text-[var(--accent-green)]" /> Your Taste Map
                </h2>
                <Link
                    to="/settings/taste"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:text-white"
                >
                    <FaSlidersH className="text-[10px]" /> Customize
                </Link>
            </div>

            {tasteSummary && (
                <p className="mb-4 text-sm italic text-white/60">“{tasteSummary}”</p>
            )}

            {!hasSignal ? (
                <p className="text-sm text-white/50">
                    Start browsing, rating, and watchlisting — your taste map builds itself as you go.
                </p>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Genres */}
                    <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">Top Genres</h3>
                        {favoriteGenres.slice(0, 4).map((g) => (
                            <Bar key={g.id} label={g.name} score={g.score} />
                        ))}
                        {!favoriteGenres.length && <p className="text-xs text-white/35">Learning…</p>}
                    </div>

                    {/* Moods */}
                    <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">Top Moods</h3>
                        {favoriteMoods.slice(0, 4).map((m) => (
                            <Bar key={m.id} label={MOOD_LABEL[m.id] || m.id} score={m.score} accent="#8b5cf6" />
                        ))}
                        {!favoriteMoods.length && <p className="text-xs text-white/35">Learning…</p>}
                    </div>

                    {/* Decades + evolving */}
                    <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">Favorite Eras</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {favoriteDecades.length
                                ? favoriteDecades.map((d) => (
                                    <span key={d} className="rounded-md bg-white/8 px-2 py-1 text-xs text-white/75">{d}s</span>
                                ))
                                : <p className="text-xs text-white/35">Learning…</p>}
                        </div>
                        {evolvingInterests.length > 0 && (
                            <>
                                <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-white/45">Rising</h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {evolvingInterests.map((g) => (
                                        <span key={g.id} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-green-dim)] px-2 py-1 text-xs text-[var(--accent-green)]">
                                            <FaArrowUp className="text-[8px]" /> {g.name}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Accuracy */}
                    <div className="flex flex-col items-center justify-center rounded-xl bg-black/20 p-4 text-center">
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/45">Reco Accuracy</h3>
                        {accuracyScore != null ? (
                            <>
                                <div className="text-3xl font-extrabold text-[var(--primary)]">{accuracyScore}%</div>
                                <p className="mt-1 text-[11px] text-white/45">of picks you engaged with</p>
                            </>
                        ) : (
                            <p className="text-xs text-white/40">Keep exploring to unlock</p>
                        )}
                    </div>
                </div>
            )}

            {/* Taste Evolution — how interests shifted over the last few weeks */}
            {evolution && (evolution.genres?.length > 0 || evolution.dna?.length > 0) && (
                <div className="mt-5 border-t border-white/8 pt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/45">
                        Taste Evolution · last {evolution.sinceDays} days
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {[...(evolution.genres || []), ...(evolution.dna || [])]
                            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                            .slice(0, 8)
                            .map((m) => {
                                const up = m.delta > 0;
                                return (
                                    <span
                                        key={m.key}
                                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                                            up ? 'bg-[var(--accent-green-dim)] text-[var(--accent-green)]' : 'bg-red-500/10 text-red-400'
                                        }`}
                                    >
                                        {up ? <FaArrowUp className="text-[8px]" /> : <FaArrowDown className="text-[8px]" />}
                                        {m.name} {up ? '+' : ''}{m.delta}%
                                    </span>
                                );
                            })}
                    </div>
                </div>
            )}
        </section>
    );
}
