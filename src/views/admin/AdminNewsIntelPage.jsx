import React, { useState, useEffect, useCallback } from "react";
import {
    FaBrain, FaLayerGroup, FaChartLine, FaKey, FaSync, FaCheck, FaTimes,
    FaEye, FaRobot, FaExclamationTriangle, FaArrowUp, FaArrowDown,
    FaNewspaper, FaUsers, FaFilter, FaPlay, FaArchive
} from "react-icons/fa";
import { useToast } from "../../components/Toast";
import { supabase } from "../../lib/supabase";

const API_BASE = '/api/admin/rss';

async function getAccessToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed?.session?.access_token || null;
}

async function callApi(job, body = {}) {
    const token = await getAccessToken();
    if (!token) {
        return { ok: false, error: 'You must be signed in as admin to use News Intelligence features.' };
    }
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ job, ...body }),
    });
    return res.json();
}

const TABS = [
    { key: 'intelligence', label: 'Intelligence', icon: FaBrain },
    { key: 'clusters', label: 'Clusters', icon: FaLayerGroup },
    { key: 'trending', label: 'Trending', icon: FaChartLine },
    { key: 'keywords', label: 'Keywords', icon: FaKey },
];

// Score badge component
const ScoreBadge = ({ score, size = 'md' }) => {
    const getColor = () => {
        if (score >= 72) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (score >= 45) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-red-500/20 text-red-400 border-red-500/30';
    };
    const sizeClass = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
    return (
        <span className={`${sizeClass} rounded border font-medium ${getColor()}`}>
            {score}
        </span>
    );
};

// Probability bar component
const ProbabilityBar = ({ label, value, threshold = 0.5 }) => {
    const pct = Math.round((value || 0) * 100);
    const isHigh = value > threshold;
    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="w-20 text-white/50">{label}</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${isHigh ? 'bg-red-500' : 'bg-green-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`w-8 text-right ${isHigh ? 'text-red-400' : 'text-white/50'}`}>{pct}%</span>
        </div>
    );
};

// Intelligence Tab - Classification queue and details
const IntelligenceTab = () => {
    const toast = useToast();
    const [pendingArticles, setPendingArticles] = useState([]);
    const [classifiedArticles, setClassifiedArticles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [classifying, setClassifying] = useState(null);
    const [stats, setStats] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pending, classified, kwStats, classifierStatus] = await Promise.all([
                callApi('pending-classification', { limit: 50 }),
                callApi('trending-clusters', { limit: 20, minScore: 0 }),
                callApi('keyword-stats'),
                callApi('classifier-status'),
            ]);
            setPendingArticles(pending.articles || []);
            setStats({
                keywords: kwStats.stats,
                classifier: classifierStatus,
            });
        } catch (err) {
            toast.error('Failed to load data');
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleClassify = async (articleId) => {
        setClassifying(articleId);
        try {
            const result = await callApi('classify-article', { articleId });
            if (result.ok) {
                toast.success('Article classified');
                loadData();
            } else {
                toast.error(result.error || 'Classification failed');
            }
        } catch (err) {
            toast.error('Classification failed');
        }
        setClassifying(null);
    };

    const handleBatchClassify = async () => {
        const ids = pendingArticles.slice(0, 10).map(a => a.id);
        if (!ids.length) return;
        setLoading(true);
        try {
            const result = await callApi('batch-classify', { articleIds: ids, concurrency: 3 });
            toast.success(`Classified ${result.successful}/${result.total} articles`);
            loadData();
        } catch (err) {
            toast.error('Batch classification failed');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Status Cards */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                        <FaNewspaper /> Pending Classification
                    </div>
                    <div className="text-2xl font-bold text-white">{pendingArticles.length}</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                        <FaKey /> Rejection Keywords
                    </div>
                    <div className="text-2xl font-bold text-white">{stats?.keywords?.rejection?.total || 0}</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                        <FaKey /> Positive Keywords
                    </div>
                    <div className="text-2xl font-bold text-white">{stats?.keywords?.positive?.total || 0}</div>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                        <FaRobot /> Classifier
                    </div>
                    <div className={`text-lg font-bold ${stats?.classifier?.enabled ? 'text-green-400' : 'text-red-400'}`}>
                        {stats?.classifier?.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div className="text-xs text-white/40">{stats?.classifier?.defaultModel}</div>
                </div>
            </div>

            {/* Pending Articles */}
            <div className="bg-[#1a1a1a] rounded-lg border border-white/10">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="text-white font-medium flex items-center gap-2">
                        <FaBrain /> Pending Classification
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={handleBatchClassify}
                            disabled={loading || !pendingArticles.length}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded text-sm hover:bg-orange-500/30 disabled:opacity-50"
                        >
                            <FaRobot /> Classify Top 10
                        </button>
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 rounded text-sm hover:bg-white/20"
                        >
                            <FaSync className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>
                <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                    {pendingArticles.length === 0 ? (
                        <div className="p-8 text-center text-white/40">No articles pending classification</div>
                    ) : (
                        pendingArticles.map(article => (
                            <div key={article.id} className="p-4 hover:bg-white/5">
                                <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-white font-medium truncate">{article.title}</h4>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                                            <span>{article.source_name}</span>
                                            <span>{new Date(article.published_at).toLocaleDateString()}</span>
                                            {article.positive_keyword_score != null && (
                                                <span className="text-green-400">+{article.positive_keyword_score}</span>
                                            )}
                                            {article.negative_keyword_score != null && (
                                                <span className="text-red-400">-{article.negative_keyword_score}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleClassify(article.id)}
                                        disabled={classifying === article.id}
                                        className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 disabled:opacity-50"
                                    >
                                        {classifying === article.id ? <FaSync className="animate-spin" /> : <FaRobot />}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// Clusters Tab - Story cluster management
const ClustersTab = () => {
    const toast = useToast();
    const [clusters, setClusters] = useState([]);
    const [unclusteredCount, setUnclusteredCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [selectedCluster, setSelectedCluster] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [trending, unclustered] = await Promise.all([
                callApi('trending-clusters', { limit: 50, minScore: 0, includeArticles: true }),
                callApi('unclustered-articles', { limit: 100 }),
            ]);
            setClusters(trending.clusters || []);
            setUnclusteredCount(unclustered.count || 0);
        } catch (err) {
            toast.error('Failed to load clusters');
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleClusterUnclustered = async () => {
        setLoading(true);
        try {
            const unclustered = await callApi('unclustered-articles', { limit: 20 });
            if (unclustered.articles?.length) {
                const ids = unclustered.articles.map(a => a.id);
                const result = await callApi('batch-cluster', { articleIds: ids });
                toast.success(`Clustered ${result.successful} articles, ${result.newClusters} new clusters`);
                loadData();
            } else {
                toast.info('No unclustered articles');
            }
        } catch (err) {
            toast.error('Clustering failed');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Status Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-[#1a1a1a] rounded-lg px-4 py-2 border border-white/10">
                        <span className="text-white/50 text-sm">Active Clusters:</span>
                        <span className="text-white font-bold ml-2">{clusters.length}</span>
                    </div>
                    <div className="bg-[#1a1a1a] rounded-lg px-4 py-2 border border-white/10">
                        <span className="text-white/50 text-sm">Unclustered:</span>
                        <span className="text-orange-400 font-bold ml-2">{unclusteredCount}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {unclusteredCount > 0 && (
                        <button
                            onClick={handleClusterUnclustered}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 text-orange-400 rounded text-sm hover:bg-orange-500/30 disabled:opacity-50"
                        >
                            <FaLayerGroup /> Cluster Pending
                        </button>
                    )}
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 rounded text-sm hover:bg-white/20"
                    >
                        <FaSync className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* Clusters Grid */}
            <div className="grid grid-cols-2 gap-4">
                {clusters.map(cluster => (
                    <div
                        key={cluster.id}
                        className="bg-[#1a1a1a] rounded-lg border border-white/10 p-4 cursor-pointer hover:border-orange-500/30 transition-colors"
                        onClick={() => setSelectedCluster(selectedCluster?.id === cluster.id ? null : cluster)}
                    >
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <h4 className="text-white font-medium line-clamp-2">{cluster.canonical_title}</h4>
                            <ScoreBadge score={cluster.trend_score} />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-white/40">
                            <span className="flex items-center gap-1">
                                <FaNewspaper /> {cluster.article_count} articles
                            </span>
                            <span className="flex items-center gap-1">
                                <FaUsers /> {cluster.trusted_source_count} trusted
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                cluster.verification_level === 'studio_confirmed' ? 'bg-green-500/20 text-green-400' :
                                cluster.verification_level === 'multiple_sources' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-white/10 text-white/50'
                            }`}>
                                {cluster.verification_level?.replace('_', ' ')}
                            </span>
                        </div>
                        {cluster.main_event && (
                            <p className="text-xs text-white/50 mt-2 line-clamp-2">{cluster.main_event}</p>
                        )}
                        {selectedCluster?.id === cluster.id && cluster.articles?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                {cluster.articles.slice(0, 5).map(article => (
                                    <div key={article.id} className="flex items-center gap-2 text-xs">
                                        {article.source_logo_url && (
                                            <img src={article.source_logo_url} alt="" className="w-4 h-4 rounded" />
                                        )}
                                        <span className="text-white/70 truncate flex-1">{article.title}</span>
                                        {article.is_primary_source && (
                                            <span className="text-orange-400 text-[10px]">PRIMARY</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Trending Tab - Live trending dashboard with publish controls
const TrendingTab = () => {
    const toast = useToast();
    const [publishReady, setPublishReady] = useState([]);
    const [reviewQueue, setReviewQueue] = useState([]);
    const [loading, setLoading] = useState(false);
    const [publishing, setPublishing] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ready, review] = await Promise.all([
                callApi('publish-ready-clusters'),
                callApi('review-queue-detailed'),
            ]);
            setPublishReady(ready.clusters || []);
            setReviewQueue(review.clusters || []);
        } catch (err) {
            toast.error('Failed to load data');
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAutoPublish = async (clusterId) => {
        setPublishing(clusterId);
        try {
            const result = await callApi('auto-publish-cluster', { clusterId });
            if (result.ok) {
                toast.success(`Published: ${result.headline}`);
                loadData();
            } else {
                toast.error(result.error || 'Publish failed');
            }
        } catch (err) {
            toast.error('Publish failed');
        }
        setPublishing(null);
    };

    const handleReject = async (clusterId) => {
        try {
            const result = await callApi('reject-cluster', { clusterId, reason: 'Manual rejection from admin' });
            if (result.ok) {
                toast.success('Cluster rejected');
                loadData();
            }
        } catch (err) {
            toast.error('Reject failed');
        }
    };

    const handleProcessAll = async () => {
        setLoading(true);
        try {
            const result = await callApi('process-publish-ready');
            toast.success(`Published ${result.published}/${result.total} clusters`);
            loadData();
        } catch (err) {
            toast.error('Batch publish failed');
        }
        setLoading(false);
    };

    const handleRecalculate = async () => {
        setLoading(true);
        try {
            const result = await callApi('recalculate-all-trends');
            toast.success(`Recalculated ${result.updated} clusters`);
            loadData();
        } catch (err) {
            toast.error('Recalculation failed');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="bg-green-500/10 rounded-lg px-4 py-2 border border-green-500/20">
                        <span className="text-green-400/70 text-sm">Publish Ready (≥72):</span>
                        <span className="text-green-400 font-bold ml-2">{publishReady.length}</span>
                    </div>
                    <div className="bg-yellow-500/10 rounded-lg px-4 py-2 border border-yellow-500/20">
                        <span className="text-yellow-400/70 text-sm">Review Queue (45-71):</span>
                        <span className="text-yellow-400 font-bold ml-2">{reviewQueue.length}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {publishReady.length > 0 && (
                        <button
                            onClick={handleProcessAll}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 disabled:opacity-50"
                        >
                            <FaPlay /> Publish All Ready
                        </button>
                    )}
                    <button
                        onClick={handleRecalculate}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded text-sm hover:bg-blue-500/30 disabled:opacity-50"
                    >
                        <FaChartLine /> Recalculate Scores
                    </button>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white/70 rounded text-sm hover:bg-white/20"
                    >
                        <FaSync className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Publish Ready */}
            {publishReady.length > 0 && (
                <div className="bg-[#1a1a1a] rounded-lg border border-green-500/20">
                    <div className="p-4 border-b border-white/10">
                        <h3 className="text-green-400 font-medium flex items-center gap-2">
                            <FaCheck /> Ready for Auto-Publish
                        </h3>
                    </div>
                    <div className="divide-y divide-white/5">
                        {publishReady.map(cluster => (
                            <div key={cluster.id} className="p-4 flex items-center gap-4">
                                <ScoreBadge score={cluster.trend_score} />
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white font-medium truncate">{cluster.canonical_title}</h4>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                                        <span>{cluster.article_count} sources</span>
                                        <span>{cluster.verification_level?.replace('_', ' ')}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleAutoPublish(cluster.id)}
                                    disabled={publishing === cluster.id}
                                    className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30 disabled:opacity-50"
                                >
                                    {publishing === cluster.id ? <FaSync className="animate-spin" /> : 'Publish'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Review Queue */}
            <div className="bg-[#1a1a1a] rounded-lg border border-yellow-500/20">
                <div className="p-4 border-b border-white/10">
                    <h3 className="text-yellow-400 font-medium flex items-center gap-2">
                        <FaExclamationTriangle /> Needs Review
                    </h3>
                </div>
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                    {reviewQueue.length === 0 ? (
                        <div className="p-8 text-center text-white/40">No clusters in review queue</div>
                    ) : (
                        reviewQueue.map(cluster => (
                            <div key={cluster.id} className="p-4">
                                <div className="flex items-start gap-4">
                                    <ScoreBadge score={cluster.trend_score} />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-white font-medium">{cluster.canonical_title}</h4>
                                        {cluster.evaluation && !cluster.evaluation.eligible && (
                                            <p className="text-xs text-red-400 mt-1">{cluster.evaluation.reason}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                                            <span>{cluster.article_count} sources</span>
                                            <span>{cluster.verification_level?.replace('_', ' ')}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAutoPublish(cluster.id)}
                                            className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded text-sm hover:bg-green-500/30"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => handleReject(cluster.id)}
                                            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// Keywords Tab - Keyword dictionary stats
const KeywordsTab = () => {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const loadStats = useCallback(async () => {
        try {
            const result = await callApi('keyword-stats');
            setStats(result.stats);
        } catch (err) {
            toast.error('Failed to load keyword stats');
        }
    }, [toast]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const handleTest = async () => {
        if (!testText.trim()) return;
        setLoading(true);
        try {
            const result = await callApi('analyze-keywords', { title: testText, text: '' });
            setTestResult(result.analysis);
        } catch (err) {
            toast.error('Analysis failed');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-6">
                {/* Rejection Keywords */}
                <div className="bg-[#1a1a1a] rounded-lg border border-red-500/20 p-4">
                    <h3 className="text-red-400 font-medium mb-4 flex items-center gap-2">
                        <FaTimes /> Rejection Keywords ({stats?.rejection?.total || 0})
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {stats?.rejection && Object.entries(stats.rejection).filter(([k]) => k !== 'total').map(([key, count]) => (
                            <div key={key} className="flex justify-between text-white/60">
                                <span className="capitalize">{key.replace('_', ' ')}</span>
                                <span className="text-white/40">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Positive Keywords */}
                <div className="bg-[#1a1a1a] rounded-lg border border-green-500/20 p-4">
                    <h3 className="text-green-400 font-medium mb-4 flex items-center gap-2">
                        <FaCheck /> Positive Keywords ({stats?.positive?.total || 0})
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        {stats?.positive && Object.entries(stats.positive).filter(([k]) => k !== 'total').map(([key, count]) => (
                            <div key={key} className="flex justify-between text-white/60">
                                <span className="capitalize">{key.replace('_', ' ')}</span>
                                <span className="text-white/40">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Test Keywords */}
            <div className="bg-[#1a1a1a] rounded-lg border border-white/10 p-4">
                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                    <FaFilter /> Test Keywords
                </h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="Enter a headline to test..."
                        className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50"
                        onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                    />
                    <button
                        onClick={handleTest}
                        disabled={loading || !testText.trim()}
                        className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded text-sm hover:bg-orange-500/30 disabled:opacity-50"
                    >
                        {loading ? <FaSync className="animate-spin" /> : 'Analyze'}
                    </button>
                </div>

                {testResult && (
                    <div className="mt-4 p-4 bg-black/30 rounded-lg">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">+{testResult.positiveScore}</div>
                                <div className="text-xs text-white/40">Positive</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-400">-{testResult.negativeScore}</div>
                                <div className="text-xs text-white/40">Negative</div>
                            </div>
                            <div className="text-center">
                                <div className={`text-2xl font-bold ${testResult.netScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {testResult.netScore >= 0 ? '+' : ''}{testResult.netScore}
                                </div>
                                <div className="text-xs text-white/40">Net</div>
                            </div>
                            <div className="flex-1" />
                            <div className={`px-3 py-1.5 rounded text-sm font-medium ${
                                testResult.recommendation?.action === 'reject' ? 'bg-red-500/20 text-red-400' :
                                testResult.recommendation?.action === 'classify' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-green-500/20 text-green-400'
                            }`}>
                                {testResult.recommendation?.action?.toUpperCase()}
                            </div>
                        </div>
                        <p className="text-sm text-white/60">{testResult.recommendation?.reason}</p>
                        {testResult.matchedPositive?.length > 0 && (
                            <div className="mt-3">
                                <span className="text-xs text-green-400">Matched positive: </span>
                                <span className="text-xs text-white/50">
                                    {testResult.matchedPositive.map(m => m.term).join(', ')}
                                </span>
                            </div>
                        )}
                        {testResult.matchedNegative?.length > 0 && (
                            <div className="mt-1">
                                <span className="text-xs text-red-400">Matched negative: </span>
                                <span className="text-xs text-white/50">
                                    {testResult.matchedNegative.map(m => m.term).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Main Page Component
const AdminNewsIntelPage = () => {
    const [activeTab, setActiveTab] = useState('intelligence');

    return (
        <div className="p-4 sm:p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <FaBrain className="text-orange-400" />
                    News Intelligence
                </h1>
                <p className="text-white/50 text-sm mt-1">
                    AI-powered editorial filtering, story clustering, and automated publishing
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-[#1a1a1a] rounded-lg p-1 w-fit">
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${
                                activeTab === tab.key
                                    ? 'bg-orange-500/20 text-orange-400'
                                    : 'text-white/60 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <Icon />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {activeTab === 'intelligence' && <IntelligenceTab />}
            {activeTab === 'clusters' && <ClustersTab />}
            {activeTab === 'trending' && <TrendingTab />}
            {activeTab === 'keywords' && <KeywordsTab />}
        </div>
    );
};

export default AdminNewsIntelPage;
