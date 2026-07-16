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

const GENRE_VIBE_KEYS = {
    drama: ["emotional", "thoughtful", "intense"],
    action: ["intense", "thrilling"],
    thriller: ["thrilling", "intense", "thoughtful"],
    horror: ["thrilling", "intense"],
    comedy: ["funny", "emotional"],
    romance: ["romantic", "emotional"],
    "science fiction": ["thoughtful", "thrilling", "intense"],
    fantasy: ["thoughtful", "thrilling", "emotional"],
    mystery: ["thoughtful", "thrilling", "intense"],
    crime: ["intense", "thrilling", "thoughtful"],
    family: ["funny", "emotional"],
    animation: ["funny", "emotional", "thoughtful"],
    war: ["intense", "emotional", "thoughtful"],
    adventure: ["thrilling", "intense", "funny"],
    documentary: ["thoughtful", "emotional"],
    history: ["thoughtful", "emotional", "intense"],
    music: ["emotional", "funny", "romantic"],
};

// Sparse genre fallback: unrelated vibes remain zero.
const generateVibeScores = (genres = []) => {
    const genreNames = genres.map(g => g.name?.toLowerCase() || "");

    const vibes = {
        emotional: 0,
        thrilling: 0,
        funny: 0,
        romantic: 0,
        thoughtful: 0,
        intense: 0
    };

    // Drama boosts
    if (genreNames.includes("drama")) {
        vibes.emotional += 55;
        vibes.thoughtful += 35;
        vibes.intense += 10;
    }

    // Action/Thriller boosts
    if (genreNames.includes("action")) {
        vibes.thrilling += 45;
        vibes.intense += 55;
    }
    if (genreNames.includes("thriller")) {
        vibes.thrilling += 60;
        vibes.intense += 45;
        vibes.thoughtful += 15;
    }

    // Horror boosts
    if (genreNames.includes("horror")) {
        vibes.thrilling += 65;
        vibes.intense += 60;
    }

    // Comedy boosts
    if (genreNames.includes("comedy")) {
        vibes.funny += 70;
    }

    // Romance boosts
    if (genreNames.includes("romance")) {
        vibes.romantic += 70;
        vibes.emotional += 35;
    }

    // Sci-Fi/Fantasy
    if (genreNames.includes("science fiction") || genreNames.includes("fantasy")) {
        vibes.thoughtful += 40;
        vibes.thrilling += 25;
    }

    // Mystery
    if (genreNames.includes("mystery") || genreNames.includes("crime")) {
        vibes.thoughtful += 45;
        vibes.thrilling += 35;
    }

    // Family/Animation
    if (genreNames.includes("family") || genreNames.includes("animation")) {
        vibes.funny += 45;
        vibes.emotional += 35;
    }

    // War
    if (genreNames.includes("war")) {
        vibes.intense += 65;
        vibes.emotional += 50;
    }

    // Adventure
    if (genreNames.includes("adventure")) {
        vibes.thrilling += 45;
        vibes.intense += 25;
    }

    // Unknown genres still get one neutral, useful signal.
    if (!Object.values(vibes).some((value) => value > 0)) vibes.thoughtful = 100;

    return vibes;
};

function selectRelevantVibes(genres, sourceVibes) {
    const genreNames = genres.map((g) => g.name?.toLowerCase() || "");
    const relevantKeys = new Set(
        genreNames.flatMap((name) => GENRE_VIBE_KEYS[name] || [])
    );

    let entries = VIBE_CATEGORIES
        .map((cat) => [cat.key, Number(sourceVibes?.[cat.key]) || 0])
        .filter(([key, value]) => value > 0 && (!relevantKeys.size || relevantKeys.has(key)))
        .sort((a, b) => b[1] - a[1]);

    // Keep only genuinely meaningful signals: max four, and no tiny tail slices.
    const strongest = entries[0]?.[1] || 0;
    entries = entries
        .filter(([, value], index) => index < 2 || value >= strongest * 0.3)
        .slice(0, 4);

    // A poor stored analysis can conflict with every genre. Fall back safely.
    if (!entries.length) {
        entries = Object.entries(generateVibeScores(genres))
            .filter(([, value]) => value > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
    }

    return Object.fromEntries(entries);
}

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

    // Custom analysis replaces the fallback; it is not merged with default values.
    const hasCustomVibes = customVibes && Object.values(customVibes).some(v => v > 0);
    const rawVibes = hasCustomVibes ? customVibes : generateVibeScores(genres);
    const vibes = selectRelevantVibes(genres, rawVibes);

    // Normalize scores to percentages and filter out 0% vibes
    const total = Object.values(vibes).reduce((a, b) => a + b, 0);
    const vibeData = VIBE_CATEGORIES.map(cat => ({
        ...cat,
        value: vibes[cat.key] || 0,
        percentage: total > 0 ? Math.round(((vibes[cat.key] || 0) / total) * 100) : 0
    })).filter(v => v.value > 0).sort((a, b) => b.value - a.value);

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
            <div className="py-2">
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
                            {/* Center circle — pointer-events none so slice hover still works near the hole */}
                            <circle cx="60" cy="60" r="25" fill="#0a0a0a" style={{ pointerEvents: 'none' }} />
                            {activeVibe ? (
                                <>
                                    <text
                                        x="60"
                                        y="52"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize="8"
                                        fontWeight="600"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {activeVibe.label}
                                    </text>
                                    <text
                                        x="60"
                                        y="68"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill={activeVibe.color}
                                        fontSize="14"
                                        fontWeight="bold"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {activeVibe.percentage}%
                                    </text>
                                </>
                            ) : (
                                <>
                                    <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                                        MOVIE
                                    </text>
                                    <text x="60" y="67" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" opacity="0.6" style={{ pointerEvents: 'none' }}>
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
                            className={`flex items-center gap-2.5 px-2 py-1 rounded-lg cursor-pointer transition-colors ${hoveredVibe === vibe.key ? 'bg-white/5' : ''}`}
                            onMouseEnter={() => setHoveredVibe(vibe.key)}
                            onMouseLeave={() => setHoveredVibe(null)}
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
        <div className="py-2">
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
                        <circle cx="60" cy="60" r="28" fill="#0a0a0a" style={{ pointerEvents: 'none' }} />
                        {activeVibe ? (
                            <>
                                <text
                                    x="60"
                                    y="52"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill="white"
                                    fontSize="9"
                                    fontWeight="600"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {activeVibe.label}
                                </text>
                                <text
                                    x="60"
                                    y="70"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fill={activeVibe.color}
                                    fontSize="16"
                                    fontWeight="bold"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {activeVibe.percentage}%
                                </text>
                            </>
                        ) : (
                            <>
                                <text x="60" y="55" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                                    MOVIE
                                </text>
                                <text x="60" y="68" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="10" opacity="0.6" style={{ pointerEvents: 'none' }}>
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
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${hoveredVibe === vibe.key ? 'bg-white/5' : ''}`}
                            onMouseEnter={() => setHoveredVibe(vibe.key)}
                            onMouseLeave={() => setHoveredVibe(null)}
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
