import React, { useCallback, useEffect, useState } from "react";
import { FaSync, FaEyeSlash, FaExternalLinkAlt } from "react-icons/fa";
import { getHomeFeed } from "../../lib/recommendationApi";
import { updateFeedArticleStatus } from "../../lib/db/rss";
import { clearHomeFeedCache } from "../../lib/homeFeedCache";
import { invalidateFeedCaches } from "../../lib/feedSessionCache";

/**
 * Exactly what the public Feed tab shows right now for "New trailers" and
 * "Latest news", straight from the same API the Feed uses.
 * Bump `refreshKey` after an admin edit to reload it.
 */
export default function HomeFeedPreview({ refreshKey = 0 }) {
    const [feed, setFeed] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hidingId, setHidingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        clearHomeFeedCache();
        const res = await getHomeFeed({ fresh: true });
        setFeed(res);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load, refreshKey]);

    const hideNews = async (article) => {
        if (!confirm(`Hide "${article.title}" from the home feed?\n\nIt is marked as rejected in RSS Sources and the next story takes its place.`)) return;
        setHidingId(article.id);
        const result = await updateFeedArticleStatus(article.id, "rejected");
        setHidingId(null);
        if (!result.success) {
            alert(`Could not hide: ${result.error?.message || "Unknown error"}`);
            return;
        }
        invalidateFeedCaches();
        load();
    };

    const trailers = feed?.trailers || [];
    const news = feed?.news || [];
    const picks = trailers.filter((t) => t.approved).length;

    return (
        <section className="mb-6 rounded-xl border border-white/10 bg-[#141414] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-white">Live on the home feed</h2>
                    <p className="mt-0.5 text-xs text-white/40">
                        What users see right now. Signed-out visitors can take up to 5 minutes to get changes.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    className="flex shrink-0 items-center gap-1.5 text-xs text-white/50 hover:text-white"
                >
                    <FaSync className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            {feed && !feed.ok && (
                <p className="mb-3 text-xs text-red-400">Could not load the feed: {feed.error}</p>
            )}

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                New trailers
                {!loading && (
                    <span className="ml-2 normal-case tracking-normal text-white/35">
                        {picks} your pick{picks === 1 ? "" : "s"} · {trailers.length - picks} auto-filled (popular)
                    </span>
                )}
            </h3>
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {loading && !feed
                    ? [...Array(4)].map((_, i) => <div key={i} className="aspect-video animate-pulse rounded-lg bg-white/5" />)
                    : trailers.map((t) => (
                        <div key={t.youtubeKey} className="min-w-0">
                            <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                                <img
                                    src={t.thumbnail}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                        if (t.thumbnailFallback && e.currentTarget.src !== t.thumbnailFallback) {
                                            e.currentTarget.src = t.thumbnailFallback;
                                        }
                                    }}
                                />
                                <span
                                    className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                        t.approved ? "bg-orange-500 text-black" : "bg-black/70 text-white/70"
                                    }`}
                                >
                                    {t.approved ? "Your pick" : "Auto"}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-white/80">{t.title}</p>
                        </div>
                    ))}
            </div>

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Latest news
                <span className="ml-2 normal-case tracking-normal text-white/35">
                    Picked automatically from RSS Sources, one story per outlet
                </span>
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
                {loading && !feed
                    ? [...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-white/5" />)
                    : news.length === 0
                        ? <p className="text-xs text-white/40">No news stories are showing.</p>
                        : news.map((a) => (
                            <div key={a.id} className="flex gap-2 rounded-lg bg-white/5 p-2">
                                <img src={a.image} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded object-cover" />
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 text-xs font-medium text-white">{a.title}</p>
                                    <p className="mt-0.5 truncate text-[10px] text-white/40">{a.source}</p>
                                    <div className="mt-1 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => hideNews(a)}
                                            disabled={hidingId === a.id}
                                            className="flex items-center gap-1 text-[11px] text-red-400/80 hover:text-red-400 disabled:opacity-50"
                                        >
                                            <FaEyeSlash /> {hidingId === a.id ? "Hiding…" : "Hide"}
                                        </button>
                                        <a
                                            href={a.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
                                        >
                                            <FaExternalLinkAlt /> Open
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
            </div>
        </section>
    );
}
