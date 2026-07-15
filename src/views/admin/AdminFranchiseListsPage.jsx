import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
    getFranchiseModerationQueue,
    setCollectionModerationStatus,
} from "../../lib/supabase";

const STATUS_TABS = [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "all", label: "All" },
];

const slugify = (name) =>
    String(name || "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

const AdminFranchiseListsPage = () => {
    const [status, setStatus] = useState("pending");
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        const rows = await getFranchiseModerationQueue({ status, limit: 100 });
        setLists(rows || []);
        setLoading(false);
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);

    const handleModerate = async (id, next) => {
        setActingId(id);
        setError("");
        setMessage("");
        const result = await setCollectionModerationStatus(id, next);
        setActingId(null);
        if (!result.success) {
            setError(result.error?.message || "Could not update status. Run the moderation migration if needed.");
            return;
        }
        setMessage(next === "approved" ? "Approved — shows in Explore → Franchise." : next === "rejected" ? "Rejected." : "Set back to pending.");
        await load();
    };

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold text-white">Collection moderation</h1>
                <p className="text-sm text-white/45 mt-1">
                    Users can tag lists as <span className="text-amber-300">Franchise</span>. Approve them here so they appear under Explore → Collections → Franchise.
                    Approving also adds the official account as a collaborator on the list.
                </p>
            </div>

            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {STATUS_TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setStatus(t.id)}
                        className={`shrink-0 px-3 py-2 rounded-full text-xs min-h-[40px] border transition-colors ${
                            status === t.id
                                ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                                : "bg-white/5 text-white/50 border-white/10 hover:text-white"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {message && <p className="text-sm text-green-400">{message}</p>}

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                </div>
            ) : lists.length === 0 ? (
                <p className="text-sm text-white/40 py-10 text-center">
                    {status === "pending" ? "No franchise lists waiting for approval." : "Nothing in this tab."}
                </p>
            ) : (
                <div className="space-y-2">
                    {lists.map((list) => (
                        <div
                            key={list.id}
                            className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 space-y-3"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-white truncate">{list.name}</p>
                                        <span
                                            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                                list.moderation_status === "approved"
                                                    ? "bg-green-500/20 text-green-300"
                                                    : list.moderation_status === "rejected"
                                                      ? "bg-red-500/20 text-red-300"
                                                      : "bg-amber-500/20 text-amber-300"
                                            }`}
                                        >
                                            {list.moderation_status || "pending"}
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                                            Franchise
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-white/40 mt-1">
                                        {list.owner?.username ? (
                                            <Link to={`/${list.owner.username}/profile`} className="text-orange-400/90 hover:underline">
                                                @{list.owner.username}
                                            </Link>
                                        ) : (
                                            "Unknown user"
                                        )}
                                        {" · "}
                                        {list.movie_count || 0} titles
                                        {list.is_public ? " · Public" : " · Private"}
                                    </p>
                                    {list.description && (
                                        <p className="text-xs text-white/35 mt-1 line-clamp-2">{list.description}</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <Link
                                        to={`/collection/${list.slug || slugify(list.name)}`}
                                        className="text-xs px-3 py-2 rounded-md bg-white/5 text-white/60 hover:text-white min-h-[36px] inline-flex items-center"
                                    >
                                        View
                                    </Link>
                                    {list.moderation_status !== "approved" && (
                                        <button
                                            type="button"
                                            disabled={actingId === list.id}
                                            onClick={() => handleModerate(list.id, "approved")}
                                            className="text-xs px-3 py-2 rounded-md bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-50 min-h-[36px]"
                                        >
                                            Approve
                                        </button>
                                    )}
                                    {list.moderation_status !== "rejected" && (
                                        <button
                                            type="button"
                                            disabled={actingId === list.id}
                                            onClick={() => handleModerate(list.id, "rejected")}
                                            className="text-xs px-3 py-2 rounded-md bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 min-h-[36px]"
                                        >
                                            Reject
                                        </button>
                                    )}
                                    {list.moderation_status !== "pending" && (
                                        <button
                                            type="button"
                                            disabled={actingId === list.id}
                                            onClick={() => handleModerate(list.id, "pending")}
                                            className="text-xs px-3 py-2 rounded-md bg-white/5 text-white/50 hover:text-white disabled:opacity-50 min-h-[36px]"
                                        >
                                            Re-queue
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminFranchiseListsPage;
