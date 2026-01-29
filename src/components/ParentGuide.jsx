import React, { useState, useEffect } from "react";
import { FaSkull, FaExclamationTriangle, FaHeart, FaUserShield } from "react-icons/fa";
import { MdFamilyRestroom } from "react-icons/md";
import { BiVolumeMute } from "react-icons/bi";
import axios from "axios";

// Parent Guide Badge Component
const ParentGuideBadge = ({ type, level = "none" }) => {
    const badges = {
        violence: {
            icon: FaSkull,
            label: "Violence",
            colors: {
                none: "bg-green-500/20 text-green-400 border-green-500/30",
                mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                severe: "bg-red-500/20 text-red-400 border-red-500/30"
            }
        },
        nudity: {
            icon: FaHeart,
            label: "Sex/Nudity",
            colors: {
                none: "bg-green-500/20 text-green-400 border-green-500/30",
                mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                severe: "bg-red-500/20 text-red-400 border-red-500/30"
            }
        },
        profanity: {
            icon: BiVolumeMute,
            label: "Profanity",
            colors: {
                none: "bg-green-500/20 text-green-400 border-green-500/30",
                mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                severe: "bg-red-500/20 text-red-400 border-red-500/30"
            }
        },
        frightening: {
            icon: FaExclamationTriangle,
            label: "Frightening",
            colors: {
                none: "bg-green-500/20 text-green-400 border-green-500/30",
                mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                severe: "bg-red-500/20 text-red-400 border-red-500/30"
            }
        }
    };

    const badge = badges[type];
    if (!badge) return null;

    const IconComponent = badge.icon;
    const colorClass = badge.colors[level] || badge.colors.none;
    const levelLabel = level === "none" ? "None" : level.charAt(0).toUpperCase() + level.slice(1);

    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${colorClass} text-xs font-medium`}>
            <IconComponent className="text-sm" />
            <span>{badge.label}</span>
            <span className="opacity-70">•</span>
            <span className="opacity-80">{levelLabel}</span>
        </div>
    );
};

// Certification Badge
const CertificationBadge = ({ certification }) => {
    if (!certification) return null;

    const getColor = () => {
        const cert = certification.toUpperCase();
        if (['G', 'U', 'TV-Y', 'TV-G'].includes(cert)) return 'bg-green-500/20 text-green-400 border-green-500/30';
        if (['PG', 'TV-PG', 'UA'].includes(cert)) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (['PG-13', '12A', '12', 'TV-14'].includes(cert)) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        if (['R', '15', 'MA', 'TV-MA', 'A'].includes(cert)) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
        if (['NC-17', '18', 'X'].includes(cert)) return 'bg-red-500/20 text-red-400 border-red-500/30';
        return 'bg-white/10 text-white/70 border-white/20';
    };

    return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${getColor()} text-sm font-bold`}>
            {certification}
        </div>
    );
};

// Determine content levels based on certification and genres
const determineContentLevels = (certification, genres = []) => {
    const genreNames = genres.map(g => g.name?.toLowerCase() || "");
    const cert = certification?.toUpperCase() || "";

    let guide = {
        violence: "none",
        nudity: "none",
        profanity: "none",
        frightening: "none"
    };

    // R-rated / Adult content
    if (['R', '18', 'NC-17', 'A', 'TV-MA', 'X'].includes(cert)) {
        guide.profanity = "moderate";
        guide.violence = "moderate";
    }

    // PG-13 / Teen content
    if (['PG-13', '12A', '12', '15', 'TV-14', 'UA'].includes(cert)) {
        guide.profanity = "mild";
        guide.violence = "mild";
    }

    // Genre-based adjustments
    if (genreNames.includes("horror")) {
        guide.violence = cert.includes("R") || cert.includes("18") ? "severe" : "moderate";
        guide.frightening = "severe";
    } else if (genreNames.includes("thriller")) {
        guide.frightening = "moderate";
        guide.violence = guide.violence === "none" ? "mild" : guide.violence;
    }

    if (genreNames.includes("action") || genreNames.includes("war")) {
        guide.violence = cert.includes("R") || cert.includes("18") ? "severe" : "moderate";
    }

    if (genreNames.includes("crime")) {
        guide.violence = guide.violence === "none" ? "mild" : guide.violence;
        guide.profanity = guide.profanity === "none" ? "mild" : guide.profanity;
    }

    if (genreNames.includes("romance")) {
        guide.nudity = cert.includes("R") || cert.includes("18") ? "moderate" : "mild";
    }

    if (genreNames.includes("comedy") && !genreNames.includes("family")) {
        guide.profanity = guide.profanity === "none" ? "mild" : guide.profanity;
    }

    // Family friendly override
    if (genreNames.includes("family") || genreNames.includes("animation")) {
        if (['G', 'U', 'TV-Y', 'TV-G', 'PG'].includes(cert)) {
            guide = { violence: "none", nudity: "none", profanity: "none", frightening: "none" };
        }
    }

    return guide;
};

// Main Parent Guide Component
const ParentGuide = ({ movieId, mediaType = "movie", genres = [] }) => {
    const [certification, setCertification] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCertification = async () => {
            if (!movieId) {
                setLoading(false);
                return;
            }

            try {
                let cert = null;

                if (mediaType === "movie") {
                    const response = await axios.get(`/movie/${movieId}/release_dates`);
                    const results = response.data?.results || [];

                    const usRelease = results.find(r => r.iso_3166_1 === "US");
                    const inRelease = results.find(r => r.iso_3166_1 === "IN");
                    const gbRelease = results.find(r => r.iso_3166_1 === "GB");

                    const release = usRelease || inRelease || gbRelease || results[0];
                    if (release?.release_dates?.length > 0) {
                        cert = release.release_dates.find(rd => rd.certification)?.certification;
                    }
                } else {
                    const response = await axios.get(`/tv/${movieId}/content_ratings`);
                    const results = response.data?.results || [];

                    const usRating = results.find(r => r.iso_3166_1 === "US");
                    const inRating = results.find(r => r.iso_3166_1 === "IN");

                    cert = usRating?.rating || inRating?.rating || results[0]?.rating;
                }

                setCertification(cert);
            } catch (error) {
                console.log("Error fetching certification:", error);
            }

            setLoading(false);
        };

        fetchCertification();
    }, [movieId, mediaType]);

    const guide = determineContentLevels(certification, genres);
    const isFamilyFriendly = Object.values(guide).every(level => level === "none");

    if (loading) {
        return (
            <div className="mb-6 flex gap-2">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 w-24 bg-white/5 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
                <FaUserShield className="text-white/40" />
                <h4 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Parent Guide</h4>
                {certification && (
                    <span className="text-white/30 text-xs">• Rated</span>
                )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                {certification && <CertificationBadge certification={certification} />}

                {isFamilyFriendly ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium">
                        <MdFamilyRestroom className="text-base" />
                        <span>Family Friendly</span>
                    </div>
                ) : (
                    <>
                        <ParentGuideBadge type="violence" level={guide.violence} />
                        <ParentGuideBadge type="nudity" level={guide.nudity} />
                        <ParentGuideBadge type="profanity" level={guide.profanity} />
                        <ParentGuideBadge type="frightening" level={guide.frightening} />
                    </>
                )}
            </div>
        </div>
    );
};

export default ParentGuide;
