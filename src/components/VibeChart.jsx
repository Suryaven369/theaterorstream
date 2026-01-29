import React from "react";

// Vibe categories with their characteristics
const VIBE_CATEGORIES = [
    { key: "emotional", label: "Emotional", emoji: "😢", color: "#3b82f6" },
    { key: "thrilling", label: "Thrilling", emoji: "😱", color: "#ef4444" },
    { key: "funny", label: "Funny", emoji: "😂", color: "#eab308" },
    { key: "romantic", label: "Romantic", emoji: "💕", color: "#ec4899" },
    { key: "thoughtful", label: "Thoughtful", emoji: "🤔", color: "#a855f7" },
    { key: "intense", label: "Intense", emoji: "🔥", color: "#f97316" },
];

// Generate vibe scores based on genres
const generateVibeScores = (genres = []) => {
    const genreNames = genres.map(g => g.name?.toLowerCase() || "");

    const vibes = {
        emotional: 20,
        thrilling: 20,
        funny: 20,
        romantic: 20,
        thoughtful: 20,
        intense: 20
    };

    // Drama boosts
    if (genreNames.includes("drama")) {
        vibes.emotional += 35;
        vibes.thoughtful += 20;
    }

    // Action/Thriller boosts
    if (genreNames.includes("action")) {
        vibes.thrilling += 30;
        vibes.intense += 35;
    }
    if (genreNames.includes("thriller")) {
        vibes.thrilling += 35;
        vibes.intense += 25;
    }

    // Horror boosts
    if (genreNames.includes("horror")) {
        vibes.thrilling += 40;
        vibes.intense += 30;
    }

    // Comedy boosts
    if (genreNames.includes("comedy")) {
        vibes.funny += 45;
    }

    // Romance boosts
    if (genreNames.includes("romance")) {
        vibes.romantic += 45;
        vibes.emotional += 15;
    }

    // Sci-Fi/Fantasy
    if (genreNames.includes("science fiction") || genreNames.includes("fantasy")) {
        vibes.thoughtful += 25;
        vibes.thrilling += 10;
    }

    // Mystery
    if (genreNames.includes("mystery") || genreNames.includes("crime")) {
        vibes.thoughtful += 30;
        vibes.thrilling += 20;
    }

    // Family/Animation
    if (genreNames.includes("family") || genreNames.includes("animation")) {
        vibes.funny += 20;
        vibes.emotional += 15;
    }

    // War
    if (genreNames.includes("war")) {
        vibes.intense += 35;
        vibes.emotional += 30;
    }

    // Adventure
    if (genreNames.includes("adventure")) {
        vibes.thrilling += 20;
        vibes.intense += 10;
    }

    return vibes;
};

// Pie Chart Slice Component
const PieSlice = ({ startAngle, endAngle, color, isHovered }) => {
    const radius = 50;
    const cx = 60;
    const cy = 60;

    // Convert angles to radians
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    // Calculate arc points
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    // Determine if arc is more than 180 degrees
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    const pathData = [
        `M ${cx} ${cy}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
    ].join(' ');

    return (
        <path
            d={pathData}
            fill={color}
            stroke="#0a0a0a"
            strokeWidth="1"
            style={{
                filter: isHovered ? `drop-shadow(0 0 8px ${color})` : 'none',
                transition: 'all 0.3s ease'
            }}
        />
    );
};

// Main Vibe Chart Component - PIE CHART VERSION
const VibeChart = ({ genres = [], compact = false }) => {
    const vibes = generateVibeScores(genres);

    // Normalize scores to percentages
    const total = Object.values(vibes).reduce((a, b) => a + b, 0);
    const vibeData = VIBE_CATEGORIES.map(cat => ({
        ...cat,
        value: vibes[cat.key],
        percentage: Math.round((vibes[cat.key] / total) * 100)
    })).sort((a, b) => b.value - a.value);

    // Get top 3 vibes
    const topVibes = vibeData.slice(0, 3);

    // Calculate pie slices
    let currentAngle = 0;
    const slices = vibeData.map(vibe => {
        const angle = (vibe.value / total) * 360;
        const slice = {
            ...vibe,
            startAngle: currentAngle,
            endAngle: currentAngle + angle
        };
        currentAngle += angle;
        return slice;
    });

    if (compact) {
        return (
            <div className="p-4 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10">
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🎭</span>
                    <h4 className="text-sm font-semibold text-white">Movie Vibes</h4>
                </div>

                {/* Pie Chart */}
                <div className="flex items-center gap-4">
                    <div className="relative w-24 h-24 flex-shrink-0">
                        <svg viewBox="0 0 120 120" className="w-full h-full">
                            {slices.map((slice, index) => (
                                <PieSlice
                                    key={slice.key}
                                    startAngle={slice.startAngle}
                                    endAngle={slice.endAngle}
                                    color={slice.color}
                                />
                            ))}
                            {/* Center circle */}
                            <circle cx="60" cy="60" r="25" fill="#0a0a0a" />
                            <text x="60" y="60" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
                                VIBE
                            </text>
                        </svg>
                    </div>

                    {/* Legend - Top 3 */}
                    <div className="flex-1 space-y-1.5">
                        {topVibes.map(vibe => (
                            <div key={vibe.key} className="flex items-center gap-2">
                                <div
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: vibe.color }}
                                />
                                <span className="text-[10px] text-white/70 flex-1">{vibe.emoji} {vibe.label}</span>
                                <span className="text-[10px] text-white/50">{vibe.percentage}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🎭</span>
                    <h3 className="text-base font-semibold text-white">Movie Vibes</h3>
                </div>
                <div className="flex items-center gap-1">
                    {topVibes.map(vibe => (
                        <span key={vibe.key} className="text-lg" title={vibe.label}>
                            {vibe.emoji}
                        </span>
                    ))}
                </div>
            </div>

            {/* Pie Chart & Legend */}
            <div className="flex items-center gap-6">
                {/* Pie Chart */}
                <div className="relative w-32 h-32 flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                        {slices.map((slice) => (
                            <PieSlice
                                key={slice.key}
                                startAngle={slice.startAngle}
                                endAngle={slice.endAngle}
                                color={slice.color}
                            />
                        ))}
                        {/* Center circle with gradient */}
                        <circle cx="60" cy="60" r="28" fill="#0a0a0a" />
                        <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
                            MOVIE
                        </text>
                        <text x="60" y="68" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" opacity="0.6">
                            VIBE
                        </text>
                    </svg>
                </div>

                {/* Legend */}
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
                    {vibeData.map(vibe => (
                        <div key={vibe.key} className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: vibe.color }}
                            />
                            <span className="text-xs text-white/70">{vibe.emoji}</span>
                            <span className="text-xs text-white/60 flex-1">{vibe.label}</span>
                            <span className="text-xs text-white/40">{vibe.percentage}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Vibe Summary */}
            <div className="mt-4 pt-3 border-t border-white/10">
                <p className="text-xs text-white/50">
                    This movie feels primarily{" "}
                    <span className="text-white/80 font-medium">{topVibes[0]?.label.toLowerCase()}</span>
                    {topVibes[1] && (
                        <>
                            {" "}with{" "}
                            <span className="text-white/80 font-medium">{topVibes[1]?.label.toLowerCase()}</span>
                        </>
                    )}
                    {" "}vibes.
                </p>
            </div>
        </div>
    );
};

export default VibeChart;
