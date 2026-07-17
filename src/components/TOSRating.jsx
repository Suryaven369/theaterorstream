import React from "react";

// Circular Progress Component
const CircleRating = ({ value, label, color = "green" }) => {
    const percentage = (value / 10) * 100;
    const radius = 32;
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
                className="relative w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 transition-transform duration-300 group-hover:scale-105"
                style={{ filter: `drop-shadow(0 0 6px ${colorConfig.glow})` }}
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
                        strokeWidth="5.5"
                    />

                    {/* Progress Circle */}
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        fill="none"
                        stroke={`url(#${gradientId})`}
                        strokeWidth="5.5"
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
                            className="text-base sm:text-lg font-bold"
                            style={{ color: colorConfig.stroke }}
                        >
                            {Number(value).toFixed(1)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Label */}
            <p className="mt-1.5 text-[11px] sm:text-xs text-white/55 font-medium text-center group-hover:text-white transition-colors leading-tight">
                {label}
            </p>
        </div>
    );
};

// Main TOS Rating Component
const TOSRating = ({ ratings, verdict, onRateClick, hasUserRated, sourceLabel, secondaryLabel, vertical = false }) => {
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
        <div className={`mb-6 p-5 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-sm ${vertical ? 'w-full' : 'max-w-3xl'}`}>
            {/* Header */}
            <div className={`gap-3 mb-5 ${vertical ? 'flex flex-col' : 'flex items-center justify-between'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md shadow-green-500/20 shrink-0">
                        <span className="text-white font-bold text-xs">TOS</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-white">TOS Rating</h3>
                        <p className="text-[11px] text-white/40 leading-snug break-words">
                            {sourceLabel || 'Theater or Stream Analysis'}
                        </p>
                        {secondaryLabel && (
                            <p className="text-[11px] text-white/50 mt-0.5 leading-snug break-words">{secondaryLabel}</p>
                        )}
                    </div>
                </div>

                {/* Overall Score */}
                <div className={`flex items-center gap-2.5 shrink-0 ${vertical ? 'justify-between w-full pt-3 border-t border-white/10' : ''}`}>
                    <div className={vertical ? '' : 'text-right order-first'}>
                        <p className="text-[10px] text-white/40">Overall</p>
                        <p className="text-xl font-bold text-white leading-none">{overallScore.toFixed(1)}</p>
                    </div>
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{
                            background: `conic-gradient(#22c55e ${overallScore * 10}%, rgba(255,255,255,0.1) 0)`,
                        }}
                    >
                        <div className="w-8 h-8 rounded-full bg-[#0a0a0a] flex items-center justify-center">
                            <span className="text-[10px] font-bold text-green-400">
                                {Math.round(overallScore * 10)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Rating Circles Grid */}
            <div className={`gap-3 mb-4 ${vertical ? 'grid grid-cols-3' : 'grid grid-cols-4 sm:grid-cols-7'}`}>
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
            <div className={`pt-3 border-t border-white/10 gap-3 ${vertical ? 'flex flex-col items-stretch' : 'flex items-center justify-between'}`}>
                {/* Verdict */}
                <div className={`flex items-center gap-2 min-w-0 ${vertical ? '' : 'flex-1'}`}>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${getVerdictColor()}`}>
                        {overallScore >= 7 ? "🎬 Theater" : overallScore >= 5 ? "📺 Stream" : "⏭️ Skip"}
                    </span>
                    {verdict && (
                        <p className={`text-white/60 text-xs sm:text-sm flex-1 min-w-0 ${vertical ? '' : 'line-clamp-2'}`}>{verdict}</p>
                    )}
                </div>

                {/* Rate Button - Changes based on whether user has rated */}
                {onRateClick && (
                    <button
                        onClick={onRateClick}
                        className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-white text-xs font-medium transition-all shadow-md shrink-0 ${hasUserRated
                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 hover:shadow-green-500/25'
                            : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 hover:shadow-orange-500/25'
                            }`}
                    >
                        {hasUserRated ? (
                            <>
                                <span>✓</span>
                                Update
                            </>
                        ) : (
                            <>
                                <span>⭐</span>
                                Rate
                            </>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default TOSRating;
