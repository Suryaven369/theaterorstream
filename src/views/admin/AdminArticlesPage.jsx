import React, { useState, useEffect, useCallback } from "react";
import { FaCheck, FaTimes, FaTrash, FaToggleOn, FaToggleOff, FaSync, FaPlus, FaRss, FaGlobe, FaPen, FaYoutube, FaFilter, FaSortAmountDown, FaSortAmountUp } from "react-icons/fa";
import {
    getRssSources,
    createRssSource,
    updateRssSource,
    getRssGlobalFilters,
    setRssGlobalFilters,
    toggleRssSourceActive,
    deleteRssSource,
    getFeedArticles,
    getFeedArticleCountsBySource,
    updateFeedArticleStatus,
    regenerateFeedArticleSummary,
    toggleFeedArticleActive,
    deleteFeedArticle,
} from "../../lib/supabase";
import { triggerRssRefresh } from "../../lib/adminSyncApi";
import { useToast } from "../../components/Toast";
import ConfirmationModal from "../../components/ConfirmationModal";

const STATUS_TABS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Live" },
    { key: "rejected", label: "Rejected" },
];

const DAYS_BACK_OPTIONS = [
    { value: 1, label: "Last 24 hours" },
    { value: 3, label: "Last 3 days" },
    { value: 7, label: "Last 7 days" },
    { value: 14, label: "Last 14 days" },
    { value: 30, label: "Last 30 days" },
    { value: 0, label: "All time" },
];

/** News RSS candidates live in the browser until approve (never pending in DB). */
const ARTICLE_INBOX_KEY = "tos:rss-article-inbox";

function readArticleInbox() {
    try {
        const raw = sessionStorage.getItem(ARTICLE_INBOX_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeArticleInbox(items) {
    try {
        sessionStorage.setItem(ARTICLE_INBOX_KEY, JSON.stringify(items));
    } catch {
        /* ignore quota */
    }
}

function mergeArticleCandidates(existing, incoming) {
    const map = new Map();
    for (const item of existing || []) {
        if (item?.id) map.set(item.id, item);
    }
    for (const item of incoming || []) {
        if (item?.id) map.set(item.id, { ...item, _candidate: true });
    }
    return [...map.values()].sort((a, b) => {
        const ta = new Date(a.published_at || 0).getTime();
        const tb = new Date(b.published_at || 0).getTime();
        return tb - ta;
    });
}

function collectCandidatesFromRefresh(payload) {
    const out = [];
    if (Array.isArray(payload?.result?.candidates)) out.push(...payload.result.candidates);
    if (Array.isArray(payload?.results)) {
        for (const r of payload.results) {
            if (Array.isArray(r?.candidates)) out.push(...r.candidates);
        }
    }
    return out;
}

const SourceListItem = ({ source, active, pendingCount, onSelect, onToggle, onRefresh, onDelete, onEdit, refreshing }) => (
    <div
        onClick={() => onSelect(source.id)}
        className={`group flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
            active ? "bg-orange-500/15 border border-orange-500/30" : "border border-transparent hover:bg-white/5"
        }`}
    >
        {source.logo_url ? (
            <img
                src={source.logo_url}
                alt={source.name}
                className="w-4 h-4 rounded-sm shrink-0"
                onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextSibling.style.display = "inline-block";
                }}
            />
        ) : null}
        <FaRss className={`shrink-0 text-sm ${active ? "text-orange-400" : "text-white/30"} ${source.logo_url ? "hidden" : ""}`} />
        <div className="flex-1 min-w-0">
            <p className={`text-sm truncate ${active ? "text-white font-medium" : "text-white/70"}`}>{source.name}</p>
            {source.last_fetch_error && (
                <p className="text-[10px] text-red-400 truncate">Fetch error</p>
            )}
        </div>
        {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 shrink-0">
                {pendingCount}
            </span>
        )}
        <button
            onClick={(e) => { e.stopPropagation(); onEdit(source); }}
            className="text-white/30 hover:text-white shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit name, link & filters"
        >
            <FaPen className="text-[11px]" />
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); onRefresh(source); }}
            disabled={refreshing}
            className="text-white/30 hover:text-white shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Refresh this source"
        >
            <FaSync className={`text-xs ${refreshing ? "animate-spin" : ""}`} />
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); onToggle(source); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title={source.is_active ? "Pause source" : "Resume source"}
        >
            {source.is_active ? <FaToggleOn className="text-base text-green-400" /> : <FaToggleOff className="text-base text-white/30" />}
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); onDelete(source); }}
            className="text-white/30 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete this RSS feed"
        >
            <FaTrash className="text-xs" />
        </button>
    </div>
);

const keywordsToText = (arr) => (Array.isArray(arr) ? arr.join(", ") : "");
const textToKeywords = (text) => String(text || "")
    .split(/[,\n]/).map((k) => k.trim()).filter(Boolean);

// Add/edit a feed source — just the name, link and kind. Keyword filtering is
// global (set once via "Filter Keywords"), so adding a channel stays simple.
const SourceFormModal = ({ open, initial, defaultKind = "article", onClose, onSaved }) => {
    const toast = useToast();
    const [name, setName] = useState("");
    const [feedUrl, setFeedUrl] = useState("");
    const [siteUrl, setSiteUrl] = useState("");
    const [kind, setKind] = useState("article");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(initial?.name || "");
        setFeedUrl(initial?.feed_url || "");
        setSiteUrl(initial?.site_url || "");
        setKind(initial?.source_kind || defaultKind || "article");
    }, [open, initial, defaultKind]);

    if (!open) return null;
    const isEdit = !!initial?.id;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !feedUrl.trim()) return;
        setSaving(true);
        const payload = {
            name: name.trim(),
            feed_url: feedUrl.trim(),
            site_url: siteUrl.trim() || null,
            source_kind: kind,
        };
        const result = isEdit
            ? await updateRssSource(initial.id, payload)
            : await createRssSource(payload);
        setSaving(false);
        if (result.success) {
            toast.success(`${isEdit ? "Updated" : "Added"} "${payload.name}".`);
            onSaved();
            onClose();
        } else {
            toast.error(`Failed: ${result.error?.message || "Unknown error"}`);
        }
    };

    const inputCls = "w-full text-sm bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <form
                onClick={(e) => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 space-y-3"
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">{isEdit ? "Edit Source" : "Add Source"}</h3>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white"><FaTimes /></button>
                </div>

                <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
                    {[{ k: "article", label: "News Article", icon: <FaRss className="text-[10px]" /> }, { k: "trailer", label: "Trailer (YouTube)", icon: <FaYoutube className="text-[11px]" /> }].map((t) => (
                        <button
                            key={t.k}
                            type="button"
                            onClick={() => setKind(t.k)}
                            className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${kind === t.k ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:text-white"}`}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                <div>
                    <label className="text-xs text-white/50">Title</label>
                    <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IndieWire / Marvel YouTube" />
                </div>
                <div>
                    <label className="text-xs text-white/50">Link (feed URL)</label>
                    <input className={inputCls} value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://site.com/feed/ or YouTube channel RSS" />
                    {kind === "trailer" && (
                        <p className="mt-1 text-[10px] text-white/30">
                            YouTube channel feed: <code>https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID</code>
                        </p>
                    )}
                </div>
                <div>
                    <label className="text-xs text-white/50">Site URL (optional)</label>
                    <input className={inputCls} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://site.com" />
                </div>

                <p className="text-[10px] text-white/30 flex items-center gap-1.5">
                    <FaFilter className="text-[9px]" /> Keyword filtering is global — set it once via “Filter Keywords”.
                </p>

                <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md text-white/60 hover:text-white">Cancel</button>
                    <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50">
                        {saving ? "Saving…" : isEdit ? "Save changes" : "Add source"}
                    </button>
                </div>
            </form>
        </div>
    );
};

// Global keyword filters — set once per kind, applied to every source.
const GlobalFiltersModal = ({ open, onClose }) => {
    const toast = useToast();
    const [trailerInc, setTrailerInc] = useState("");
    const [trailerExc, setTrailerExc] = useState("");
    const [articleInc, setArticleInc] = useState("");
    const [articleExc, setArticleExc] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        getRssGlobalFilters().then((f) => {
            setTrailerInc(keywordsToText(f.trailer.include));
            setTrailerExc(keywordsToText(f.trailer.exclude));
            setArticleInc(keywordsToText(f.article.include));
            setArticleExc(keywordsToText(f.article.exclude));
            setLoading(false);
        });
    }, [open]);

    if (!open) return null;

    const handleSave = async () => {
        setSaving(true);
        const result = await setRssGlobalFilters({
            trailer: { include: textToKeywords(trailerInc), exclude: textToKeywords(trailerExc) },
            article: { include: textToKeywords(articleInc), exclude: textToKeywords(articleExc) },
        });
        setSaving(false);
        if (result.success) { toast.success("Saved global filters. Refresh sources to apply."); onClose(); }
        else toast.error(`Failed: ${result.error?.message || "Unknown error"}`);
    };

    const inputCls = "w-full text-sm bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white flex items-center gap-2"><FaFilter className="text-sm" /> Global Keyword Filters</h3>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white"><FaTimes /></button>
                </div>
                <p className="text-[11px] text-white/40">Set once — applied to every source of that kind. Comma-separated, case-insensitive, matched against title + summary. Leave blank to fetch everything.</p>

                {loading ? (
                    <div className="h-40 animate-pulse rounded-lg bg-white/5" />
                ) : (
                    <>
                        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3 space-y-2">
                            <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5"><FaYoutube /> Trailers</p>
                            <div>
                                <label className="text-[11px] text-white/50">Include (only keep items with any of these)</label>
                                <input className={inputCls} value={trailerInc} onChange={(e) => setTrailerInc(e.target.value)} placeholder="trailer, teaser, first look" />
                            </div>
                            <div>
                                <label className="text-[11px] text-white/50">Exclude</label>
                                <input className={inputCls} value={trailerExc} onChange={(e) => setTrailerExc(e.target.value)} placeholder="reaction, breakdown, podcast" />
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                            <p className="text-xs font-semibold text-white/70 flex items-center gap-1.5"><FaRss className="text-[10px]" /> News Articles</p>
                            <div>
                                <label className="text-[11px] text-white/50">Include</label>
                                <input className={inputCls} value={articleInc} onChange={(e) => setArticleInc(e.target.value)} placeholder="(blank = fetch all)" />
                            </div>
                            <div>
                                <label className="text-[11px] text-white/50">Exclude</label>
                                <input className={inputCls} value={articleExc} onChange={(e) => setArticleExc(e.target.value)} placeholder="sponsored, advertisement" />
                            </div>
                        </div>
                    </>
                )}

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md text-white/60 hover:text-white">Cancel</button>
                    <button type="button" onClick={handleSave} disabled={saving || loading} className="text-sm px-4 py-2 rounded-md bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50">
                        {saving ? "Saving…" : "Save filters"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ArticleDetailModal = ({ article, onClose, onRegenerate, regenerating }) => {
    if (!article) return null;

    const published = article.published_at
        ? new Date(article.published_at).toLocaleString()
        : "—";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-orange-400/80 mb-1">Article</p>
                        <h3 className="text-base font-semibold text-white leading-snug">{article.title}</h3>
                        <p className="text-[11px] text-white/40 mt-1.5">
                            {article.source_name || "Unknown source"} &middot; {published}
                            {article.status === "approved" && (
                                <span className="ml-1.5 text-green-400/80">· Live</span>
                            )}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white shrink-0">
                        <FaTimes />
                    </button>
                </div>

                {article.image_url && (
                    <img
                        src={article.image_url}
                        alt=""
                        className="w-full max-h-48 object-cover rounded-xl bg-black border border-white/5"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                )}

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-white/35">Summary</p>
                        {article.status === "approved" && onRegenerate && (
                            <button
                                type="button"
                                onClick={() => onRegenerate(article)}
                                disabled={regenerating}
                                className="text-[11px] text-orange-400 hover:text-orange-300 disabled:opacity-50"
                            >
                                {regenerating ? "Refreshing…" : "Regenerate from page"}
                            </button>
                        )}
                    </div>
                    {article.summary ? (
                        <pre className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                            {article.summary}
                        </pre>
                    ) : (
                        <p className="text-sm text-white/35 italic">No summary saved yet. Approve the article to generate one.</p>
                    )}
                    {Array.isArray(article.summary_items) && article.summary_items.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                            {article.summary_items.map((it, i) => (
                                <div key={`${it.title}-${i}`} className="shrink-0 w-16">
                                    <div className="aspect-[2/3] rounded-md overflow-hidden bg-black/40 border border-white/10">
                                        {it.imageUrl ? (
                                            <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-white/30">No img</div>
                                        )}
                                    </div>
                                    <p className="text-[9px] text-white/50 mt-1 line-clamp-2">{i + 1}. {it.title}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {article.link && (
                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300"
                    >
                        Open original ↗
                    </a>
                )}
            </div>
        </div>
    );
};

const ArticleRow = ({ article, status, selected, onSelectToggle, onApprove, onReject, onToggle, onDelete, onOpen, acting }) => (
    <div className={`relative flex items-center gap-3 p-3 rounded-xl bg-[#1a1a1a] border transition-colors ${selected ? "border-orange-500/50" : "border-white/10"} ${acting ? "opacity-70" : ""}`}>
        {acting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-[1px]">
                <FaSync className="text-orange-400 text-sm animate-spin" />
            </div>
        )}
        <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelectToggle(article.id)}
            disabled={acting}
            className="shrink-0 w-4 h-4 accent-orange-500 cursor-pointer disabled:opacity-40"
        />
        <button
            type="button"
            onClick={() => onOpen?.(article)}
            className="flex flex-1 min-w-0 items-center gap-3 text-left rounded-lg hover:bg-white/[0.03] transition-colors -my-1 py-1"
            title="View summary"
        >
            {article.image_url ? (
                <img
                    src={article.image_url}
                    alt={article.title}
                    loading="lazy"
                    className="w-20 h-12 object-cover rounded-lg bg-black shrink-0"
                    onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextSibling?.classList.remove("hidden");
                    }}
                />
            ) : null}
            <div className={`w-20 h-12 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-white/20 text-[10px] ${article.image_url ? "hidden" : ""}`}>
                No image
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{article.title}</p>
                <p className="text-[11px] text-white/40 truncate">
                    {article.source_name} &middot; {article.published_at ? new Date(article.published_at).toLocaleDateString() : "—"}
                </p>
                {status === "approved" && article.summary && (
                    <p className="text-[11px] text-white/55 line-clamp-2 mt-0.5">{article.summary}</p>
                )}
            </div>
        </button>
        {status === "pending" && (
            <>
                <button
                    onClick={() => onApprove(article)}
                    disabled={acting}
                    className="text-xs px-3 py-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                >
                    <FaCheck /> Approve
                </button>
                <button
                    onClick={() => onReject(article)}
                    disabled={acting}
                    className="text-xs px-3 py-1.5 rounded-md bg-white/5 text-white/50 hover:bg-white/10 shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                >
                    <FaTimes /> Reject
                </button>
            </>
        )}
        {status === "approved" && (
            <button onClick={() => onToggle(article)} disabled={acting} className="text-white/50 hover:text-white shrink-0 disabled:opacity-50">
                {article.is_active ? <FaToggleOn className="text-xl text-green-400" /> : <FaToggleOff className="text-xl" />}
            </button>
        )}
        <button onClick={() => onDelete(article)} disabled={acting} className="text-white/40 hover:text-red-400 shrink-0 disabled:opacity-50">
            <FaTrash />
        </button>
    </div>
);

const AdminArticlesPage = () => {
    const toast = useToast();
    const [sources, setSources] = useState([]);
    const [loadingSources, setLoadingSources] = useState(true);
    const [counts, setCounts] = useState({});
    const [activeKind, setActiveKind] = useState("article"); // 'article' | 'trailer'
    const [selectedSourceId, setSelectedSourceId] = useState(null); // null = All Sources
    const [sourceFormOpen, setSourceFormOpen] = useState(false);
    const [editingSource, setEditingSource] = useState(null); // null = add new
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [refreshingId, setRefreshingId] = useState(null);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [statusTab, setStatusTab] = useState("pending");
    const [daysBack, setDaysBack] = useState(1);
    const [sortOrder, setSortOrder] = useState("desc"); // 'desc' = latest first, 'asc' = oldest first
    const [articles, setArticles] = useState([]);
    const [loadingArticles, setLoadingArticles] = useState(true);
    const [message, setMessage] = useState(null);
    const [sourceToDelete, setSourceToDelete] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkActing, setBulkActing] = useState(false);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [actingId, setActingId] = useState(null);
    const [detailArticle, setDetailArticle] = useState(null);
    const [regeneratingId, setRegeneratingId] = useState(null);
    const [articleInbox, setArticleInbox] = useState(() => readArticleInbox());

    const persistInbox = useCallback((items) => {
        setArticleInbox(items);
        writeArticleInbox(items);
    }, []);

    const removeFromInbox = useCallback((ids) => {
        const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
        setArticleInbox((prev) => {
            const next = prev.filter((a) => !idSet.has(a.id));
            writeArticleInbox(next);
            return next;
        });
    }, []);

    const loadSources = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoadingSources(true);
        const [sourceList, countMap] = await Promise.all([getRssSources(), getFeedArticleCountsBySource()]);
        setSources(sourceList);
        setCounts(countMap);
        if (!silent) setLoadingSources(false);
    }, []);

    const filterInbox = useCallback((sourceId, days, sort) => {
        let list = readArticleInbox();
        if (Array.isArray(sourceId)) {
            const allowed = new Set(sourceId);
            list = list.filter((a) => allowed.has(a.source_id));
        } else if (sourceId) {
            list = list.filter((a) => a.source_id === sourceId);
        }
        if (days > 0) {
            const since = Date.now() - days * 24 * 60 * 60 * 1000;
            list = list.filter((a) => {
                const t = new Date(a.published_at || 0).getTime();
                return Number.isFinite(t) && t >= since;
            });
        }
        list = [...list].sort((a, b) => {
            const ta = new Date(a.published_at || 0).getTime();
            const tb = new Date(b.published_at || 0).getTime();
            return sort === "asc" ? ta - tb : tb - ta;
        });
        return list.slice(0, 50);
    }, []);

    const loadArticles = useCallback(async (status, sourceId, days, sort, kind, { silent = false } = {}) => {
        if (!silent) setLoadingArticles(true);
        // News pending queue is primarily the local inbox (fetch no longer writes DB).
        // Still merge any legacy pending DB rows so older items remain reviewable.
        if (kind === "article" && status === "pending") {
            const inbox = filterInbox(sourceId, days, sort);
            const fromDb = await getFeedArticles(status, 50, sourceId, days, sort);
            const seen = new Set(inbox.map((a) => a.guid || a.id));
            const legacy = (fromDb || []).filter((a) => !seen.has(a.guid) && !seen.has(a.id));
            setArticles([...inbox, ...legacy].slice(0, 50));
        } else {
            setArticles(await getFeedArticles(status, 50, sourceId, days, sort));
        }
        if (!silent) setLoadingArticles(false);
    }, [filterInbox]);

    // Sources of the currently-selected kind (Articles vs Trailers).
    const kindSources = sources.filter((s) => (s.source_kind || "article") === activeKind);
    const kindSourceIds = kindSources.map((s) => s.id);
    // Articles to show: a specific source, or all sources of the active kind.
    const articleSourceFilter = selectedSourceId || kindSourceIds;

    // Sidebar pending badges: DB counts for trailers; inbox (+ legacy DB) for news.
    const countsView = (() => {
        const merged = { ...counts };
        for (const s of sources) {
            if ((s.source_kind || "article") !== "article") continue;
            const base = merged[s.id] || { pending: 0, approved: 0, rejected: 0 };
            const inboxPending = articleInbox.filter((a) => a.source_id === s.id).length;
            merged[s.id] = {
                ...base,
                // Inbox is the new queue; keep any legacy DB pending in the badge too.
                pending: inboxPending + (base.pending || 0),
            };
        }
        return merged;
    })();

    useEffect(() => { loadSources(); }, [loadSources]);

    // Don't depend on `sources` object identity — refreshing counts after approve
    // was retriggering a full loading skeleton (blank blink).
    const kindSourceIdsKey = kindSourceIds.slice().sort().join(",");
    useEffect(() => {
        loadArticles(statusTab, articleSourceFilter, daysBack, sortOrder, activeKind);
        setSelectedIds(new Set());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusTab, selectedSourceId, daysBack, sortOrder, activeKind, kindSourceIdsKey, loadArticles, articleInbox]);

    const switchKind = (k) => { setActiveKind(k); setSelectedSourceId(null); };

    const refreshAll = () => {
        loadSources();
        loadArticles(statusTab, articleSourceFilter, daysBack, sortOrder, activeKind);
    };

    const openAddSource = () => { setEditingSource(null); setSourceFormOpen(true); };
    const openEditSource = (source) => { setEditingSource(source); setSourceFormOpen(true); };

    const handleToggleSource = async (source) => {
        await toggleRssSourceActive(source.id);
        loadSources();
    };

    const handleDeleteSource = (source) => setSourceToDelete(source);

    const confirmDeleteSource = async () => {
        const source = sourceToDelete;
        if (!source) return;
        const result = await deleteRssSource(source.id);
        if (result.success) {
            toast.success(`Removed "${source.name}" from RSS sources.`);
            if (selectedSourceId === source.id) setSelectedSourceId(null);
            loadSources();
        } else {
            toast.error(`Failed to remove "${source.name}": ${result.error?.message || "Unknown error"}`);
        }
    };

    const handleRefreshSource = async (source) => {
        setRefreshingId(source.id);
        setMessage(null);
        try {
            const res = await triggerRssRefresh(source.id);
            const candidates = collectCandidatesFromRefresh(res);
            if (candidates.length) {
                persistInbox(mergeArticleCandidates(readArticleInbox(), candidates));
            }
            const newCount = candidates.length || res.result?.added || 0;
            const isTrailerSrc = (source.source_kind || "article") === "trailer";
            setMessage({
                type: res.result?.error ? "error" : "success",
                text: res.result?.error
                    ? `${source.name}: ${res.result.error}`
                    : isTrailerSrc
                        ? `${source.name}: fetched ${res.result?.fetched ?? 0}, added ${res.result?.added ?? 0} new.`
                        : `${source.name}: fetched ${res.result?.fetched ?? 0}, ${newCount} ready to review (saved only on approve).`,
            });
            refreshAll();
        } catch (err) {
            setMessage({ type: "error", text: err.message || "Refresh failed" });
        }
        setRefreshingId(null);
    };

    const handleRefreshAll = async () => {
        setRefreshingAll(true);
        setMessage(null);
        try {
            const res = await triggerRssRefresh();
            const candidates = collectCandidatesFromRefresh(res);
            if (candidates.length) {
                persistInbox(mergeArticleCandidates(readArticleInbox(), candidates));
            }
            const totalAdded = (res.results || []).reduce((sum, r) => sum + (r.added || 0), 0);
            const totalReady = candidates.length || totalAdded;
            const errors = (res.results || []).filter((r) => r.error);
            setMessage({
                type: errors.length ? "error" : "success",
                text: errors.length
                    ? `Refreshed with ${errors.length} error(s). ${totalReady} item(s) ready to review.`
                    : `Fetched feeds — ${totalReady} item(s) ready to review (news not saved until approve).`,
            });
            refreshAll();
        } catch (err) {
            setMessage({ type: "error", text: err.message || "Refresh failed" });
        }
        setRefreshingAll(false);
    };

    const refreshCounts = useCallback(async () => {
        setCounts(await getFeedArticleCountsBySource());
    }, []);

    const removeArticleFromList = (id) => {
        setArticles((prev) => prev.filter((a) => a.id !== id));
        removeFromInbox(id);
        setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleApprove = async (article) => {
        setActingId(article.id);
        const result = await updateFeedArticleStatus(article, "approved");
        if (result.success) {
            removeArticleFromList(article.id);
            refreshCounts();
            if (result.summary) {
                toast.success("Approved — saved to DB with summary from full article page.");
            } else {
                toast.success("Approved — saved to DB.");
            }
        } else {
            toast.error(result.error?.message || "Approve failed");
        }
        setActingId(null);
    };

    const handleRegenerateSummary = async (article) => {
        setRegeneratingId(article.id);
        const result = await regenerateFeedArticleSummary(article.id);
        if (result.success) {
            const nextSummary = result.summary || "";
            const nextItems = result.summaryItems || null;
            setArticles((prev) =>
                prev.map((a) => (a.id === article.id ? { ...a, summary: nextSummary, summary_items: nextItems } : a)),
            );
            setDetailArticle((prev) => (prev?.id === article.id ? { ...prev, summary: nextSummary, summary_items: nextItems } : prev));
            toast.success(nextSummary ? "Summary regenerated from the live page." : "Regenerated, but no summary could be built.");
        } else {
            toast.error(result.error?.message || "Regenerate failed");
        }
        setRegeneratingId(null);
    };

    const handleReject = async (article) => {
        setActingId(article.id);
        const result = await updateFeedArticleStatus(article, "rejected");
        if (result.success) {
            removeArticleFromList(article.id);
            refreshCounts();
        } else {
            toast.error(result.error?.message || "Reject failed");
        }
        setActingId(null);
    };

    const handleToggleArticle = async (article) => {
        setActingId(article.id);
        await toggleFeedArticleActive(article.id);
        setArticles((prev) =>
            prev.map((a) => (a.id === article.id ? { ...a, is_active: !a.is_active } : a)),
        );
        setActingId(null);
    };

    const handleDeleteArticle = async (article) => {
        if (!confirm(`Delete "${article.title}"?`)) return;
        setActingId(article.id);
        const result = await deleteFeedArticle(article.id);
        if (result.success) {
            toast.success(`Deleted "${article.title}".`);
            removeArticleFromList(article.id);
            refreshCounts();
        } else {
            toast.error(`Failed to delete article: ${result.error?.message || "Unknown error"}`);
        }
        setActingId(null);
    };

    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allSelected = articles.length > 0 && selectedIds.size === articles.length;

    const toggleSelectAll = () => {
        setSelectedIds(allSelected ? new Set() : new Set(articles.map((a) => a.id)));
    };

    const handleBulkApprove = async () => {
        setBulkActing(true);
        const selected = articles.filter((a) => selectedIds.has(a.id));
        const results = await Promise.all(selected.map((a) => updateFeedArticleStatus(a, "approved")));
        const failed = results.filter((r) => !r.success).length;
        const okIds = selected.filter((_, i) => results[i]?.success).map((a) => a.id);
        const failedIds = new Set(selected.filter((_, i) => !results[i]?.success).map((a) => a.id));
        toast[failed ? "error" : "success"](
            failed
                ? `Approved ${okIds.length}, failed on ${failed} article(s).`
                : `Approved ${okIds.length} article(s).`,
        );
        removeFromInbox(okIds);
        setSelectedIds(new Set());
        setArticles((prev) => prev.filter((a) => failedIds.has(a.id) || !okIds.includes(a.id)));
        refreshCounts();
        setBulkActing(false);
    };

    const handleBulkDelete = () => setConfirmBulkDelete(true);

    const confirmBulkDeleteAction = async () => {
        setBulkActing(true);
        const ids = [...selectedIds];
        const results = await Promise.all(ids.map((id) => deleteFeedArticle(id)));
        const failed = results.filter((r) => !r.success).length;
        const okIds = ids.filter((_, i) => results[i]?.success);
        toast[failed ? "error" : "success"](
            failed
                ? `Deleted ${okIds.length}, failed on ${failed} article(s).`
                : `Deleted ${okIds.length} article(s).`,
        );
        const failedIds = new Set(ids.filter((_, i) => !results[i]?.success));
        removeFromInbox(okIds);
        setSelectedIds(new Set());
        setArticles((prev) => prev.filter((a) => failedIds.has(a.id) || !okIds.includes(a.id)));
        refreshCounts();
        setBulkActing(false);
    };

    const selectedSource = sources.find((s) => s.id === selectedSourceId) || null;
    const totalPending = kindSources.reduce((sum, s) => sum + (countsView[s.id]?.pending || 0), 0);
    const isTrailers = activeKind === "trailer";

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Left: RSS sources sidebar */}
            <aside className="w-72 shrink-0 border-r border-white/10 flex flex-col h-full">
                <div className="p-4 border-b border-white/10 shrink-0">
                    {/* Articles vs Trailers space */}
                    <div className="flex gap-1 bg-white/5 rounded-lg p-1 mb-3">
                        <button
                            onClick={() => switchKind("article")}
                            className={`flex-1 text-xs px-2 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors ${!isTrailers ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:text-white"}`}
                        >
                            <FaRss className="text-[10px]" /> Articles
                        </button>
                        <button
                            onClick={() => switchKind("trailer")}
                            className={`flex-1 text-xs px-2 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors ${isTrailers ? "bg-red-500/20 text-red-400" : "text-white/50 hover:text-white"}`}
                        >
                            <FaYoutube className="text-[11px]" /> Trailers
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-sm font-bold text-white">{isTrailers ? "Trailer Channels" : "RSS Sources"}</h1>
                        <button
                            onClick={handleRefreshAll}
                            disabled={refreshingAll}
                            className="text-white/40 hover:text-white disabled:opacity-50"
                            title="Refresh all sources"
                        >
                            <FaSync className={refreshingAll ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                        <button
                            onClick={openAddSource}
                            className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1.5"
                        >
                            <FaPlus className="text-[10px]" /> {isTrailers ? "Add YouTube channel" : "Add source"}
                        </button>
                        <button
                            onClick={() => setFiltersOpen(true)}
                            className="text-xs text-white/40 hover:text-white flex items-center gap-1.5"
                            title="Global keyword filters (set once)"
                        >
                            <FaFilter className="text-[10px]" /> Filter Keywords
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    <div
                        onClick={() => setSelectedSourceId(null)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                            selectedSourceId === null ? "bg-orange-500/15 border border-orange-500/30" : "border border-transparent hover:bg-white/5"
                        }`}
                    >
                        <FaGlobe className={`shrink-0 text-sm ${selectedSourceId === null ? "text-orange-400" : "text-white/30"}`} />
                        <p className={`flex-1 text-sm ${selectedSourceId === null ? "text-white font-medium" : "text-white/70"}`}>{isTrailers ? "All Trailers" : "All Sources"}</p>
                        {totalPending > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 shrink-0">
                                {totalPending}
                            </span>
                        )}
                    </div>

                    {loadingSources ? (
                        <div className="space-y-2 pt-2">
                            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}
                        </div>
                    ) : kindSources.length === 0 ? (
                        <p className="text-xs text-white/40 py-4 text-center">
                            {isTrailers ? "No trailer channels yet. Add a YouTube channel above." : "No sources yet."}
                        </p>
                    ) : (
                        kindSources.map((source) => (
                            <SourceListItem
                                key={source.id}
                                source={source}
                                active={selectedSourceId === source.id}
                                pendingCount={countsView[source.id]?.pending || 0}
                                refreshing={refreshingId === source.id}
                                onSelect={setSelectedSourceId}
                                onToggle={handleToggleSource}
                                onRefresh={handleRefreshSource}
                                onDelete={handleDeleteSource}
                                onEdit={openEditSource}
                            />
                        ))
                    )}
                </div>

                {selectedSource && (
                    <div className="p-3 border-t border-white/10 shrink-0">
                        <p className="text-[11px] text-white/30 truncate">{selectedSource.feed_url}</p>
                    </div>
                )}
            </aside>

            {/* Center: articles for the selected source (or all) */}
            <main className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {selectedSource ? selectedSource.name : isTrailers ? "All Trailers" : "All Sources"}
                            </h2>
                            <p className="text-sm text-white/40 mt-0.5">
                                {isTrailers
                                    ? "Review fetched trailers/teasers before they go live."
                                    : "Review fetched articles before they go live on the Home feed."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => (selectedSource ? handleRefreshSource(selectedSource) : handleRefreshAll())}
                                disabled={selectedSource ? refreshingId === selectedSource.id : refreshingAll}
                                className="text-xs px-3 py-2 rounded-md bg-white/5 text-white/70 hover:bg-white/10 flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <FaSync className={(selectedSource ? refreshingId === selectedSource.id : refreshingAll) ? "animate-spin" : ""} />
                                Refresh
                            </button>
                            {selectedSource && (
                                <button
                                    onClick={() => openEditSource(selectedSource)}
                                    className="text-xs px-3 py-2 rounded-md bg-white/5 text-white/70 hover:bg-white/10 flex items-center gap-1.5"
                                >
                                    <FaPen /> Edit
                                </button>
                            )}
                        </div>
                    </div>

                    {message && (
                        <p className={`text-sm mb-4 ${message.type === "error" ? "text-red-400" : "text-green-400"}`}>
                            {message.text}
                        </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
                            {STATUS_TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setStatusTab(tab.key)}
                                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                                        statusTab === tab.key ? "bg-orange-500/20 text-orange-400" : "text-white/50 hover:text-white"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
                                title={sortOrder === "desc" ? "Showing latest first — click for oldest first" : "Showing oldest first — click for latest first"}
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                {sortOrder === "desc" ? <FaSortAmountDown className="text-[11px]" /> : <FaSortAmountUp className="text-[11px]" />}
                                {sortOrder === "desc" ? "Latest" : "Oldest"}
                            </button>
                            <select
                                value={daysBack}
                                onChange={(e) => setDaysBack(Number(e.target.value))}
                                className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-white/70 focus:outline-none focus:border-orange-500/50"
                            >
                                {DAYS_BACK_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="bg-[#1a1a1a]">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {loadingArticles ? (
                        <div className="space-y-2">
                            {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
                        </div>
                    ) : articles.length === 0 ? (
                        <p className="text-sm text-white/40 py-12 text-center">No articles in this category.</p>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-2 mb-2 px-1">
                                <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 accent-orange-500 cursor-pointer"
                                    />
                                    Select all ({articles.length})
                                </label>

                                {selectedIds.size > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/40">{selectedIds.size} selected</span>
                                        {statusTab === "pending" && (
                                            <button
                                                onClick={handleBulkApprove}
                                                disabled={bulkActing}
                                                className="text-xs px-3 py-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 flex items-center gap-1.5 disabled:opacity-50"
                                            >
                                                <FaCheck /> Approve Selected
                                            </button>
                                        )}
                                        <button
                                            onClick={handleBulkDelete}
                                            disabled={bulkActing}
                                            className="text-xs px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <FaTrash /> Delete Selected
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                {articles.map((article) => (
                                    <ArticleRow
                                        key={article.id}
                                        article={article}
                                        status={statusTab}
                                        selected={selectedIds.has(article.id)}
                                        onSelectToggle={toggleSelect}
                                        onApprove={handleApprove}
                                        onReject={handleReject}
                                        onToggle={handleToggleArticle}
                                        onDelete={handleDeleteArticle}
                                        onOpen={setDetailArticle}
                                        acting={actingId === article.id || (bulkActing && selectedIds.has(article.id))}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </main>

            <ArticleDetailModal
                article={detailArticle}
                onClose={() => setDetailArticle(null)}
                onRegenerate={handleRegenerateSummary}
                regenerating={!!detailArticle && regeneratingId === detailArticle.id}
            />

            <SourceFormModal
                open={sourceFormOpen}
                initial={editingSource}
                defaultKind={activeKind}
                onClose={() => setSourceFormOpen(false)}
                onSaved={() => { loadSources(); loadArticles(statusTab, articleSourceFilter, daysBack, sortOrder); }}
            />

            <GlobalFiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} />

            <ConfirmationModal
                isOpen={!!sourceToDelete}
                onClose={() => setSourceToDelete(null)}
                onConfirm={confirmDeleteSource}
                title="Delete RSS Feed"
                message={
                    sourceToDelete
                        ? `Remove "${sourceToDelete.name}" (${sourceToDelete.feed_url})? Its already-fetched articles stay, but no new ones will be pulled in.`
                        : ""
                }
                confirmText="Delete"
            />

            <ConfirmationModal
                isOpen={confirmBulkDelete}
                onClose={() => setConfirmBulkDelete(false)}
                onConfirm={confirmBulkDeleteAction}
                title="Delete Selected Articles"
                message={`Delete ${selectedIds.size} selected article(s)? This can't be undone.`}
                confirmText="Delete"
            />
        </div>
    );
};

export default AdminArticlesPage;
