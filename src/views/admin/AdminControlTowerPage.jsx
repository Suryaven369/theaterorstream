import { useCallback, useEffect, useState } from "react";
import {
    createContentEvent,
    getContentEvents,
    getSyncRuns,
    getSyncState,
    getTvSeasonsBackfillRemaining,
    updateContentEventStatus,
} from "../../lib/supabase";
import { triggerSyncJob, triggerBackfill } from "../../lib/adminSyncApi";
import Loader from "../../components/Loader";

const SYNC_JOBS = [
    {
        id: "trending-daily",
        label: "Trending",
        description: "Trending movies + TV (region IN)",
        schedule: "Fridays 06:00 UTC",
    },
    {
        id: "now-playing-daily",
        label: "Now Playing",
        description: "Top 9 theatrical (28 days) + AI web ratings",
        schedule: "Daily 06:30 UTC",
    },
    {
        id: "upcoming-weekly",
        label: "Upcoming",
        description: "Upcoming movie releases",
        schedule: "Fridays 07:00 UTC",
    },
];

const EVENT_TYPES = [
    "ingest",
    "enrich",
    "publish",
    "hide",
    "snapshot_rebuild",
    "parent_guide",
    "streaming_refresh",
    "section_sync",
];

const STATUS_STYLES = {
    completed: "bg-green-500/20 text-green-400",
    running: "bg-blue-500/20 text-blue-400",
    failed: "bg-red-500/20 text-red-400",
    cancelled: "bg-white/10 text-white/50",
    pending: "bg-yellow-500/20 text-yellow-400",
    processing: "bg-blue-500/20 text-blue-400",
    done: "bg-green-500/20 text-green-400",
};

function formatWhen(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

function StatusBadge({ status }) {
    const style = STATUS_STYLES[status] || "bg-white/10 text-white/60";
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${style}`}>
            {status}
        </span>
    );
}

const AdminControlTowerPage = () => {
    const [syncState, setSyncState] = useState([]);
    const [syncRuns, setSyncRuns] = useState([]);
    const [events, setEvents] = useState([]);
    const [eventFilter, setEventFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [runningJob, setRunningJob] = useState(null);
    const [message, setMessage] = useState(null);
    const [backfillRunning, setBackfillRunning] = useState(false);
    const [backfillRemaining, setBackfillRemaining] = useState(null);
    const [newEvent, setNewEvent] = useState({
        event_type: "ingest",
        tmdb_id: "",
        media_type: "movie",
        region: "IN",
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        const [state, runs, queue] = await Promise.all([
            getSyncState(),
            getSyncRuns({ limit: 30 }),
            getContentEvents({ status: eventFilter, limit: 50 }),
        ]);
        setSyncState(state);
        setSyncRuns(runs);
        setEvents(queue);
        setLoading(false);
    }, [eventFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const refreshBackfillRemaining = useCallback(async () => {
        setBackfillRemaining(await getTvSeasonsBackfillRemaining());
    }, []);

    useEffect(() => {
        refreshBackfillRemaining();
    }, [refreshBackfillRemaining]);

    const showMessage = (text, isError = false) => {
        setMessage({ text, isError });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleRunJob = async (jobName) => {
        setRunningJob(jobName);
        try {
            const result = await triggerSyncJob(jobName);
            const wr = result?.metadata?.inTheaters?.ratings;
            const wrNote = wr
                ? ` · web ratings: ${wr.analyzed || 0} analyzed, ${wr.skipped || 0} skipped`
                : '';
            showMessage(
                `${jobName}: +${result.added} added, ${result.updated} updated, ${result.skipped} skipped${wrNote}`,
            );
            await loadData();
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            setRunningJob(null);
        }
    };

    const handleBackfillSeasons = async () => {
        setBackfillRunning(true);
        try {
            const result = await triggerBackfill('tv-seasons', { limit: 100 });
            const remaining = result.checked === 100 ? ' Click again to continue with the rest.' : '';
            showMessage(`TV seasons backfill: checked ${result.checked}, updated ${result.updated}, failed ${result.failed}.${remaining}`);
            await refreshBackfillRemaining();
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            setBackfillRunning(false);
        }
    };

    const handleAnalyzeWebRatings = async () => {
        setBackfillRunning(true);
        try {
            const result = await triggerBackfill('analyze-web-ratings', { limit: 9 });
            const reasons = (result.results || [])
                .filter((r) => r.skipped)
                .map((r) => `${r.tmdb_id}:${r.reason}${r.count != null ? `(${r.count})` : ''}`)
                .slice(0, 6)
                .join(', ');
            showMessage(
                `Web ratings: ${result.analyzed || 0} analyzed, ${result.skipped || 0} skipped`
                + (reasons ? ` · ${reasons}` : '')
                + (result.message ? ` · ${result.message}` : ''),
            );
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            setBackfillRunning(false);
        }
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        if (!newEvent.tmdb_id.trim()) {
            showMessage("TMDB ID is required", true);
            return;
        }

        const result = await createContentEvent({
            event_type: newEvent.event_type,
            tmdb_id: newEvent.tmdb_id.trim(),
            media_type: newEvent.media_type,
            region: newEvent.region,
            payload: {},
        });

        if (!result.success) {
            showMessage(result.error?.message || "Failed to queue event", true);
            return;
        }

        setNewEvent((prev) => ({ ...prev, tmdb_id: "" }));
        showMessage("Event queued");
        await loadData();
    };

    const handleEventAction = async (id, status) => {
        const result = await updateContentEventStatus(id, status);
        if (!result.success) {
            showMessage(result.error?.message || "Update failed", true);
            return;
        }
        await loadData();
    };

    const stateByJob = Object.fromEntries(syncState.map((row) => [row.job_name, row]));

    return (
        <div className="p-4 sm:p-6 max-w-6xl">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">🗼 Control Tower</h1>
                    <p className="text-white/50 text-sm">
                        Sync pipeline status, run history, and content event queue
                    </p>
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg text-sm bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-50"
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {message && (
                <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.isError
                    ? "bg-red-500/10 border-red-500/30 text-red-300"
                    : "bg-green-500/10 border-green-500/30 text-green-300"
                    }`}>
                    {message.text}
                </div>
            )}

            <section className="mb-8">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                    Sync Jobs
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                    {SYNC_JOBS.map((job) => {
                        const state = stateByJob[job.id];
                        return (
                            <div
                                key={job.id}
                                className="bg-white/5 rounded-xl p-4 border border-white/10"
                            >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                        <h3 className="text-white font-medium">{job.label}</h3>
                                        <p className="text-white/40 text-xs">{job.description}</p>
                                    </div>
                                    {state?.last_status && (
                                        <StatusBadge status={state.last_status} />
                                    )}
                                </div>
                                <div className="text-[11px] text-white/45 space-y-1 mb-4">
                                    <div>Schedule: {job.schedule}</div>
                                    <div>Last run: {formatWhen(state?.last_started_at)}</div>
                                    <div>Last success: {formatWhen(state?.last_success_at)}</div>
                                    {state?.last_cursor && (
                                        <div>Processed: {state.last_cursor} items</div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRunJob(job.id)}
                                    disabled={runningJob === job.id}
                                    className="w-full py-2 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {runningJob === job.id ? (
                                        <>
                                            <Loader size="sm" colorClass="border-white" />
                                            Running…
                                        </>
                                    ) : "Run now"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                    Maintenance
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <h3 className="text-white font-medium mb-1">Analyze In Theaters ratings</h3>
                        <p className="text-white/40 text-xs mb-4">
                            TMDB reviews → AI 7-axis scores + theater/stream verdict for the current
                            In Theaters rail. Needs <code className="text-white/50">web_ratings</code> migration
                            + <code className="text-white/50">GEMINI_API_KEY</code> on Vercel.
                        </p>
                        <button
                            onClick={handleAnalyzeWebRatings}
                            disabled={backfillRunning}
                            className="w-full py-2 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {backfillRunning ? (
                                <>
                                    <Loader size="sm" colorClass="border-white" />
                                    Running…
                                </>
                            ) : 'Analyze web ratings'}
                        </button>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                        <h3 className="text-white font-medium mb-1">Backfill TV Seasons</h3>
                        <p className="text-white/40 text-xs mb-2">
                            One-off: fetches the seasons array from TMDB for TV shows synced before
                            this field existed (100 per click).
                        </p>
                        <p className="text-[11px] text-white/45 mb-4">
                            {backfillRemaining === null ? (
                                "Checking remaining…"
                            ) : backfillRemaining === 0 ? (
                                <span className="text-green-400">All caught up — 0 remaining</span>
                            ) : (
                                <>{backfillRemaining} show{backfillRemaining === 1 ? "" : "s"} still need seasons data</>
                            )}
                        </p>
                        <button
                            onClick={handleBackfillSeasons}
                            disabled={backfillRunning || backfillRemaining === 0}
                            className="w-full py-2 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {backfillRunning ? (
                                <>
                                    <Loader size="sm" colorClass="border-white" />
                                    Running…
                                </>
                            ) : "Run now"}
                        </button>
                    </div>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                    Recent Sync Runs
                </h2>
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-black/20 text-white/50">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Job</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium">Started</th>
                                    <th className="px-4 py-3 font-medium">Added</th>
                                    <th className="px-4 py-3 font-medium">Updated</th>
                                    <th className="px-4 py-3 font-medium">Skipped</th>
                                    <th className="px-4 py-3 font-medium">Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {syncRuns.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                                            No sync runs yet. Trigger a job or wait for Friday cron.
                                        </td>
                                    </tr>
                                ) : (
                                    syncRuns.map((run) => (
                                        <tr key={run.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 text-white">{run.job_name}</td>
                                            <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                                            <td className="px-4 py-3 text-white/60">{formatWhen(run.started_at)}</td>
                                            <td className="px-4 py-3 text-green-400">{run.movies_added}</td>
                                            <td className="px-4 py-3 text-blue-400">{run.movies_updated}</td>
                                            <td className="px-4 py-3 text-white/50">{run.movies_skipped}</td>
                                            <td className="px-4 py-3 text-red-400 max-w-[200px] truncate">
                                                {run.error_message || "—"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section>
                <div className="flex items-center justify-between gap-4 mb-3">
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide">
                        Content Events Queue
                    </h2>
                    <select
                        value={eventFilter}
                        onChange={(e) => setEventFilter(e.target.value)}
                        className="bg-black/30 rounded-lg px-3 py-1.5 text-xs text-white border border-white/10"
                    >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="done">Done</option>
                        <option value="failed">Failed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <form
                    onSubmit={handleCreateEvent}
                    className="bg-white/5 rounded-xl p-4 border border-white/10 mb-4 grid gap-3 md:grid-cols-5"
                >
                    <select
                        value={newEvent.event_type}
                        onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                        className="bg-black/30 rounded-lg px-3 py-2 text-xs text-white border border-white/10"
                    >
                        {EVENT_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="TMDB ID"
                        value={newEvent.tmdb_id}
                        onChange={(e) => setNewEvent({ ...newEvent, tmdb_id: e.target.value })}
                        className="bg-black/30 rounded-lg px-3 py-2 text-xs text-white border border-white/10"
                    />
                    <select
                        value={newEvent.media_type}
                        onChange={(e) => setNewEvent({ ...newEvent, media_type: e.target.value })}
                        className="bg-black/30 rounded-lg px-3 py-2 text-xs text-white border border-white/10"
                    >
                        <option value="movie">movie</option>
                        <option value="tv">tv</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Region"
                        value={newEvent.region}
                        onChange={(e) => setNewEvent({ ...newEvent, region: e.target.value })}
                        className="bg-black/30 rounded-lg px-3 py-2 text-xs text-white border border-white/10"
                    />
                    <button
                        type="submit"
                        className="py-2 rounded-lg text-xs font-medium bg-orange-500 text-white hover:bg-orange-600"
                    >
                        Queue event
                    </button>
                </form>

                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-black/20 text-white/50">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 font-medium">TMDB</th>
                                    <th className="px-4 py-3 font-medium">Media</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium">Created</th>
                                    <th className="px-4 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                                            No events in queue.
                                        </td>
                                    </tr>
                                ) : (
                                    events.map((event) => (
                                        <tr key={event.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 text-white">{event.event_type}</td>
                                            <td className="px-4 py-3 text-white/70">{event.tmdb_id || "—"}</td>
                                            <td className="px-4 py-3 text-white/70">{event.media_type || "—"}</td>
                                            <td className="px-4 py-3"><StatusBadge status={event.status} /></td>
                                            <td className="px-4 py-3 text-white/60">{formatWhen(event.created_at)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-1 flex-wrap">
                                                    {event.status === "pending" && (
                                                        <button
                                                            onClick={() => handleEventAction(event.id, "cancelled")}
                                                            className="px-2 py-1 rounded bg-white/10 text-white/60 hover:text-white"
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                    {event.status === "failed" && (
                                                        <button
                                                            onClick={() => handleEventAction(event.id, "pending")}
                                                            className="px-2 py-1 rounded bg-orange-500/20 text-orange-400"
                                                        >
                                                            Retry
                                                        </button>
                                                    )}
                                                    {(event.status === "pending" || event.status === "processing") && (
                                                        <button
                                                            onClick={() => handleEventAction(event.id, "done")}
                                                            className="px-2 py-1 rounded bg-green-500/20 text-green-400"
                                                        >
                                                            Mark done
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default AdminControlTowerPage;
