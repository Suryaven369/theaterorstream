import React, { useState } from "react";

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
const PieSlice = ({ startAngle, endAngle, color, isHovered, onMouseEnter, onMouseLeave }) => {
    const radius = 50;
    const hoverRadius = 53;
    const r = isHovered ? hoverRadius : radius;
    const cx = 60;
    const cy = 60;

    // Convert angles to radians
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    // Calculate arc points
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    // Determine if arc is more than 180 degrees
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    const pathData = [
        `M ${cx} ${cy}`,
        `L ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
    ].join(' ');

    return (
        <path
            d={pathData}
            fill={color}
            stroke="#0a0a0a"
            strokeWidth="1.5"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                filter: isHovered ? `drop-shadow(0 0 10px ${color})` : 'none',
                opacity: isHovered ? 1 : 0.85,
                transition: 'all 0.25s ease',
                cursor: 'pointer'
            }}
        />
    );
};

// Main Vibe Chart Component - PIE CHART VERSION
const VibeChart = ({ genres = [], compact = false, customVibes = null }) => {
    const [hoveredVibe, setHoveredVibe] = useState(null);

    // Use custom vibes from DB if they exist and have values, otherwise auto-generate from genres
    const hasCustomVibes = customVibes && Object.values(customVibes).some(v => v > 0);
    const vibes = hasCustomVibes ? { ...generateVibeScores(genres), ...customVibes } : generateVibeScores(genres);

    // Normalize scores to percentages and filter out 0% vibes
    const total = Object.values(vibes).reduce((a, b) => a + b, 0);
    const vibeData = VIBE_CATEGORIES.map(cat => ({
        ...cat,
        value: vibes[cat.key],
        percentage: Math.round((vibes[cat.key] / total) * 100)
    })).filter(v => v.percentage > 0).sort((a, b) => b.value - a.value);

    // Get top 3 vibes
    const topVibes = vibeData.slice(0, 3);

    // Calculate pie slices (only non-zero)
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

    // Hovered vibe info for center display
    const activeVibe = hoveredVibe ? vibeData.find(v => v.key === hoveredVibe) : null;

    if (compact) {
        return (
            <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">🎭</span>
                    <h4 className="text-base font-semibold text-white">Movie Vibes</h4>
                </div>

                {/* Pie Chart - Centered */}
                <div className="flex justify-center mb-4">
                    <div className="relative w-44 h-44">
                        <svg viewBox="0 0 120 120" className="w-full h-full">
                            {slices.map((slice) => (
                                <PieSlice
                                    key={slice.key}
                                    startAngle={slice.startAngle}
                                    endAngle={slice.endAngle}
                                    color={slice.color}
                                    isHovered={hoveredVibe === slice.key}
                                    onMouseEnter={() => setHoveredVibe(slice.key)}
                                    onMouseLeave={() => setHoveredVibe(null)}
                                />
                            ))}
                            {/* Center circle */}
                            <circle cx="60" cy="60" r="25" fill="#0a0a0a" />
                            {activeVibe ? (
                                <>
                                    <text x="60" y="54" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="12">
                                        {activeVibe.emoji}
                                    </text>
                                    <text x="60" y="68" textAnchor="middle" dominantBaseline="middle" fill={activeVibe.color} fontSize="9" fontWeight="bold">
                                        {activeVibe.percentage}%
                                    </text>
                                </>
                            ) : (
                                <>
                                    <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold">
                                        MOVIE
                                    </text>
                                    <text x="60" y="67" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" opacity="0.6">
                                        VIBE
                                    </text>
                                </>
                            )}
                        </svg>
                    </div>
                </div>

                {/* Legend - Only non-zero vibes */}
                <div className="space-y-2">
                    {vibeData.map(vibe => (
                        <div
                            key={vibe.key}
                            className="flex items-center gap-2.5 px-2 py-1"
                        >
                            <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: vibe.color }}
                            />
                            <span className="text-xs text-white/70 flex-1">{vibe.emoji} {vibe.label}</span>
                            <span className="text-xs font-medium text-white/50">{vibe.percentage}%</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🎭</span>
                    <h3 className="text-base font-semibold text-white">Movie Vibes</h3>
                </div>
                <div className="flex items-center gap-1">
                    {topVibes.map(vibe => (
                        <span key={vibe.key} className="text-lg" title={`${vibe.label} ${vibe.percentage}%`}>
                            {vibe.emoji}
                        </span>
                    ))}
                </div>
            </div>

            {/* Pie Chart & Legend */}
            <div className="flex items-center gap-6">
                {/* Pie Chart */}
                <div className="relative w-44 h-44 flex-shrink-0">
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                        {slices.map((slice) => (
                            <PieSlice
                                key={slice.key}
                                startAngle={slice.startAngle}
                                endAngle={slice.endAngle}
                                color={slice.color}
                                isHovered={hoveredVibe === slice.key}
                                onMouseEnter={() => setHoveredVibe(slice.key)}
                                onMouseLeave={() => setHoveredVibe(null)}
                            />
                        ))}
                        {/* Center circle */}
                        <circle cx="60" cy="60" r="28" fill="#0a0a0a" />
                        {activeVibe ? (
                            <>
                                <text x="60" y="53" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14">
                                    {activeVibe.emoji}
                                </text>
                                <text x="60" y="70" textAnchor="middle" dominantBaseline="middle" fill={activeVibe.color} fontSize="10" fontWeight="bold">
                                    {activeVibe.percentage}%
                                </text>
                            </>
                        ) : (
                            <>
                                <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold">
                                    MOVIE
                                </text>
                                <text x="60" y="68" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" opacity="0.6">
                                    VIBE
                                </text>
                            </>
                        )}
                    </svg>
                </div>

                {/* Legend - Only non-zero */}
                <div className="flex-1 space-y-2">
                    {vibeData.map(vibe => (
                        <div
                            key={vibe.key}
                            className="flex items-center gap-2.5 px-2 py-1.5"
                        >
                            <div
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: vibe.color }}
                            />
                            <span className="text-sm text-white/70 flex-1">{vibe.emoji} {vibe.label}</span>
                            <span className="text-sm font-semibold text-white/40">{vibe.percentage}%</span>
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
