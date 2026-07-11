import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    getSyncState,
    getSyncRuns,
    getContentEvents,
    getGlobalUserStats,
} from "../../lib/supabase";
import { triggerSyncJob } from "../../lib/adminSyncApi";

const SYNC_JOBS = [
    { id: "trending-daily", label: "Trending", icon: "🔥" },
    { id: "now-playing-daily", label: "Now Playing", icon: "🎬" },
    { id: "upcoming-weekly", label: "Upcoming", icon: "📅" },
    { id: "popular-weekly", label: "Popular", icon: "⭐" },
    { id: "top-rated-monthly", label: "Top Rated", icon: "🏆" },
    { id: "new-releases-weekly", label: "New Releases", icon: "🆕" },
];

const QUICK_LINKS = [
    { to: "/admin/library", label: "Library", icon: "📚", desc: "Manage movies & TV" },
    { to: "/admin/pipeline", label: "Pipeline", icon: "🗼", desc: "Sync & events" },
    { to: "/admin/sections", label: "Sections", icon: "📑", desc: "Homepage layout" },
    { to: "/admin/collections", label: "Collections", icon: "🏷️", desc: "Curated lists" },
    { to: "/admin/settings", label: "Settings", icon: "⚙️", desc: "App config" },
];

function StatCard({ label, value, icon, trend, color = "white" }) {
    return (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-white/50 text-xs uppercase tracking-wide">{label}</p>
                    <p className={`text-2xl font-bold mt-1 text-${color}`}>
                        {value?.toLocaleString?.() ?? value ?? "—"}
                    </p>
                    {trend && (
                        <p className={`text-xs mt-1 ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)} this week
                        </p>
                    )}
                </div>
                <span className="text-2xl opacity-50">{icon}</span>
            </div>
        </div>
    );
}

function HealthIndicator({ status, label }) {
    const colors = {
        healthy: "bg-green-500",
        warning: "bg-yellow-500",
        error: "bg-red-500",
        unknown: "bg-white/30",
    };

    return (
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${colors[status] || colors.unknown}`} />
            <span className="text-xs text-white/60">{label}</span>
        </div>
    );
}

function QuickActionCard({ to, label, icon, desc }) {
    return (
        <Link
            to={to}
            className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 hover:border-orange-500/30 transition-all group"
        >
            <div className="flex items-center gap-3">
                <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
                <div>
                    <p className="text-white font-medium">{label}</p>
                    <p className="text-white/40 text-xs">{desc}</p>
                </div>
            </div>
        </Link>
    );
}

function SyncJobCard({ job, state, onRun, isRunning }) {
    const lastRun = state?.last_started_at
        ? new Date(state.last_started_at).toLocaleString()
        : "Never";
    const status = state?.last_status || "unknown";

    return (
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{job.icon}</span>
                    <div>
                        <p className="text-white text-sm font-medium">{job.label}</p>
                        <p className="text-white/40 text-[10px]">Last: {lastRun}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${
                            status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : status === "failed"
                                ? "bg-red-500/20 text-red-400"
                                : status === "running"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-white/10 text-white/50"
                        }`}
                    >
                        {status}
                    </span>
                    <button
                        onClick={() => onRun(job.id)}
                        disabled={isRunning}
                        className="px-2 py-1 text-[10px] rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 disabled:opacity-50"
                    >
                        {isRunning ? "..." : "Run"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const AdminDashboardPage = () => {
    const [stats, setStats] = useState(null);
    const [syncState, setSyncState] = useState([]);
    const [recentRuns, setRecentRuns] = useState([]);
    const [pendingEvents, setPendingEvents] = useState(0);
    const [loading, setLoading] = useState(true);
    const [runningJob, setRunningJob] = useState(null);
    const [message, setMessage] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [userStats, state, runs, events] = await Promise.all([
                getGlobalUserStats().catch(() => null),
                getSyncState().catch(() => []),
                getSyncRuns({ limit: 5 }).catch(() => []),
                getContentEvents({ status: "pending", limit: 1 }).catch(() => []),
            ]);

            // Fetch library stats from Edge API
            let libraryStats = null;
            try {
                const res = await fetch("/api/content/stats");
                if (res.ok) {
                    const json = await res.json();
                    libraryStats = json.data;
                }
            } catch (e) {
                console.warn("Could not fetch library stats:", e);
            }

            setStats({
                ...userStats,
                ...libraryStats,
            });
            setSyncState(state || []);
            setRecentRuns(runs || []);
            setPendingEvents(events?.length || 0);
        } catch (error) {
            console.error("Dashboard load error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 60000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleRunJob = async (jobId) => {
        setRunningJob(jobId);
        setMessage(null);
        try {
            const result = await triggerSyncJob(jobId);
            setMessage({
                text: `${jobId}: +${result.added} added, ${result.updated} updated`,
                isError: false,
            });
            loadData();
        } catch (error) {
            setMessage({ text: error.message, isError: true });
        } finally {
            setRunningJob(null);
        }
    };

    const stateByJob = Object.fromEntries(
        (syncState || []).map((row) => [row.job_name, row])
    );

    // Calculate health status
    const lastSync = recentRuns[0];
    const syncHealth = lastSync?.status === "completed" ? "healthy" : 
                       lastSync?.status === "failed" ? "error" : "unknown";
    const eventHealth = pendingEvents > 10 ? "warning" : "healthy";

    return (
        <div className="p-6 max-w-7xl">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-white/50 text-sm mt-1">
                    Overview of your content library and sync status
                </p>
            </div>

            {/* Message */}
            {message && (
                <div
                    className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
                        message.isError
                            ? "bg-red-500/10 border-red-500/30 text-red-300"
                            : "bg-green-500/10 border-green-500/30 text-green-300"
                    }`}
                >
                    {message.text}
                </div>
            )}

            {/* Health Status */}
            <div className="mb-6 flex items-center gap-6">
                <HealthIndicator status={syncHealth} label="Sync Pipeline" />
                <HealthIndicator status={eventHealth} label="Event Queue" />
                <HealthIndicator status="healthy" label="Database" />
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white/70 hover:bg-white/15"
                >
                    {loading ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                <StatCard
                    label="Total Movies"
                    value={stats?.total_movies || stats?.total_active_movies}
                    icon="🎬"
                />
                <StatCard
                    label="TV Shows"
                    value={stats?.total_tv_shows}
                    icon="📺"
                />
                <StatCard
                    label="Featured"
                    value={stats?.featured_count}
                    icon="⭐"
                />
                <StatCard
                    label="Total Users"
                    value={stats?.totalUsers}
                    icon="👥"
                />
                <StatCard
                    label="Ratings Today"
                    value={stats?.ratings_today}
                    icon="📊"
                />
                <StatCard
                    label="Pending Events"
                    value={pendingEvents}
                    icon="📋"
                    color={pendingEvents > 5 ? "yellow-400" : "white"}
                />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Quick Links */}
                <div>
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                        Quick Actions
                    </h2>
                    <div className="space-y-2">
                        {QUICK_LINKS.map((link) => (
                            <QuickActionCard key={link.to} {...link} />
                        ))}
                    </div>
                </div>

                {/* Sync Jobs */}
                <div>
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                        Sync Jobs
                    </h2>
                    <div className="space-y-2">
                        {SYNC_JOBS.map((job) => (
                            <SyncJobCard
                                key={job.id}
                                job={job}
                                state={stateByJob[job.id]}
                                onRun={handleRunJob}
                                isRunning={runningJob === job.id}
                            />
                        ))}
                    </div>
                </div>

                {/* Recent Activity */}
                <div>
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mb-3">
                        Recent Sync Runs
                    </h2>
                    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        {recentRuns.length === 0 ? (
                            <div className="p-4 text-center text-white/40 text-sm">
                                No recent sync runs
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {recentRuns.map((run) => (
                                    <div key={run.id} className="p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white text-sm">{run.job_name}</span>
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] ${
                                                    run.status === "completed"
                                                        ? "bg-green-500/20 text-green-400"
                                                        : run.status === "failed"
                                                        ? "bg-red-500/20 text-red-400"
                                                        : "bg-blue-500/20 text-blue-400"
                                                }`}
                                            >
                                                {run.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-[10px] text-white/40">
                                            <span>
                                                {new Date(run.started_at).toLocaleString()}
                                            </span>
                                            {run.movies_added > 0 && (
                                                <span className="text-green-400">
                                                    +{run.movies_added}
                                                </span>
                                            )}
                                            {run.movies_updated > 0 && (
                                                <span className="text-blue-400">
                                                    ↻{run.movies_updated}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Link
                            to="/admin/pipeline"
                            className="block px-4 py-2 text-center text-xs text-orange-400 hover:bg-white/5 border-t border-white/5"
                        >
                            View All Runs →
                        </Link>
                    </div>

                    {/* Content Stats */}
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide mt-6 mb-3">
                        Content Health
                    </h2>
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">Synced this week</span>
                            <span className="text-white">
                                {stats?.synced_this_week ?? "—"}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">Added this week</span>
                            <span className="text-green-400">
                                +{stats?.added_this_week ?? 0}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">New users this week</span>
                            <span className="text-blue-400">
                                +{stats?.new_users_this_week ?? 0}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-white/60">Last sync</span>
                            <span className="text-white/80">
                                {stats?.last_successful_sync
                                    ? new Date(stats.last_successful_sync).toLocaleString()
                                    : "—"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
