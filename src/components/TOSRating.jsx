import React from "react";

// Circular Progress Component
const CircleRating = ({ value, label, color = "green" }) => {
    const percentage = (value / 10) * 100;
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    // Color variants
    const colors = {
        green: {
            stroke: "#22c55e",
            gradient: ["#22c55e", "#10b981"],
            glow: "rgba(34, 197, 94, 0.3)",
        },
        blue: {
            stroke: "#3b82f6",
            gradient: ["#3b82f6", "#6366f1"],
            glow: "rgba(59, 130, 246, 0.3)",
        },
        purple: {
            stroke: "#a855f7",
            gradient: ["#a855f7", "#ec4899"],
            glow: "rgba(168, 85, 247, 0.3)",
        },
        orange: {
            stroke: "#f97316",
            gradient: ["#f97316", "#eab308"],
            glow: "rgba(249, 115, 22, 0.3)",
        },
        pink: {
            stroke: "#ec4899",
            gradient: ["#ec4899", "#f43f5e"],
            glow: "rgba(236, 72, 153, 0.3)",
        },
        cyan: {
            stroke: "#06b6d4",
            gradient: ["#06b6d4", "#22d3ee"],
            glow: "rgba(6, 182, 212, 0.3)",
        },
        amber: {
            stroke: "#f59e0b",
            gradient: ["#f59e0b", "#fbbf24"],
            glow: "rgba(245, 158, 11, 0.3)",
        },
    };

    const colorConfig = colors[color] || colors.green;
    const gradientId = `gradient-${label.replace(/\s+/g, "-")}`;

    return (
        <div className="flex flex-col items-center group">
            {/* Circle Container */}
            <div
                className="relative w-24 h-24 transition-transform duration-300 group-hover:scale-110"
                style={{ filter: `drop-shadow(0 0 8px ${colorConfig.glow})` }}
            >
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                    {/* Gradient Definition */}
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={colorConfig.gradient[0]} />
                            <stop offset="100%" stopColor={colorConfig.gradient[1]} />
                        </linearGradient>
                    </defs>

                    {/* Background Circle */}
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="6"
                    />

                    {/* Progress Circle */}
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        fill="none"
                        stroke={`url(#${gradientId})`}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>

                {/* Center Value Display */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                        <span
                            className="text-xl font-bold"
                            style={{ color: colorConfig.stroke }}
                        >
                            {Number(value).toFixed(1)}
                        </span>
                        <span className="text-white/30 text-xs block -mt-1">/10</span>
                    </div>
                </div>
            </div>

            {/* Label */}
            <p className="mt-2 text-sm text-white/60 font-medium text-center group-hover:text-white transition-colors">
                {label}
            </p>
        </div>
    );
};

// Main TOS Rating Component
const TOSRating = ({ ratings, verdict, onRateClick, hasUserRated }) => {
    if (!ratings) return null;

    // Rating categories with their colors
    const ratingCategories = [
        { key: "acting", label: "Acting", color: "green" },
        { key: "screenplay", label: "Screenplay", color: "blue" },
        { key: "sound", label: "Sound", color: "purple" },
        { key: "direction", label: "Direction", color: "orange" },
        { key: "entertainmentValue", label: "Entertainment", color: "pink" },
        { key: "pacing", label: "Pacing", color: "cyan" },
        { key: "cinematicQuality", label: "Cinematography", color: "amber" },
    ];

    // Calculate overall TOS score
    const availableRatings = ratingCategories
        .map((cat) => ratings[cat.key])
        .filter((val) => val !== undefined && val !== null);

    const overallScore = availableRatings.length > 0
        ? availableRatings.reduce((a, b) => a + b, 0) / availableRatings.length
        : 0;

    // Get verdict badge color
    const getVerdictColor = () => {
        if (overallScore >= 8) return "bg-green-500/20 text-green-400 border-green-500/30";
        if (overallScore >= 6) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
        if (overallScore >= 4) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
        return "bg-red-500/20 text-red-400 border-red-500/30";
    };

    return (
        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/10 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                        <span className="text-white font-bold text-sm">TOS</span>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">TOS Rating</h3>
                        <p className="text-xs text-white/40">Theater or Stream Analysis</p>
                    </div>
                </div>

                {/* Overall Score */}
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-xs text-white/40">Overall</p>
                        <p className="text-2xl font-bold text-white">{overallScore.toFixed(1)}</p>
                    </div>
                    <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{
                            background: `conic-gradient(#22c55e ${overallScore * 10}%, rgba(255,255,255,0.1) 0)`,
                        }}
                    >
                        <div className="w-10 h-10 rounded-full bg-[#0a0a0a] flex items-center justify-center">
                            <span className="text-xs font-bold text-green-400">
                                {Math.round(overallScore * 10)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rating Circles Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-4 mb-6">
                {ratingCategories.map((category) => {
                    const value = ratings[category.key];
                    if (value === undefined || value === null) return null;

                    return (
                        <CircleRating
                            key={category.key}
                            value={value}
                            label={category.label}
                            color={category.color}
                        />
                    );
                })}
            </div>

            {/* Footer with Verdict and Rate Button */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                {/* Verdict */}
                <div className="flex items-center gap-3 flex-1">
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${getVerdictColor()}`}>
                        {overallScore >= 7 ? "🎬 Theater" : overallScore >= 5 ? "📺 Stream" : "⏭️ Skip"}
                    </span>
                    {verdict && (
                        <p className="text-white/70 text-sm flex-1">{verdict}</p>
                    )}
                </div>

                {/* Rate Button - Changes based on whether user has rated */}
                {onRateClick && (
                    <button
                        onClick={onRateClick}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium transition-all shadow-lg ${hasUserRated
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 hover:shadow-green-500/25'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 hover:shadow-orange-500/25'
                            }`}
                    >
                        {hasUserRated ? (
                            <>
                                <span>✓</span>
                                Update Rating
                            </>
                        ) : (
                            <>
                                <span>⭐</span>
                                Rate This
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default TOSRating;
