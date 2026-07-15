import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { FaSkull, FaExclamationTriangle, FaHeart, FaUserShield } from "react-icons/fa";
import { MdFamilyRestroom } from "react-icons/md";
import { BiVolumeMute } from "react-icons/bi";
import {
  parentGuideBrowsePath,
  resolveParentGuide,
  visibleParentGuideTags,
} from "../lib/parentGuide";

const BADGE_META = {
  violence: {
    icon: FaSkull,
    colors: {
      mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
      moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30",
      severe: "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30",
    },
  },
  nudity: {
    icon: FaHeart,
    colors: {
      mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
      moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30",
      severe: "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30",
    },
  },
  profanity: {
    icon: BiVolumeMute,
    colors: {
      mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
      moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30",
      severe: "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30",
    },
  },
  frightening: {
    icon: FaExclamationTriangle,
    colors: {
      mild: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
      moderate: "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30",
      severe: "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30",
    },
  },
};

function ParentGuideBadge({ type, level, label }) {
  const meta = BADGE_META[type];
  if (!meta || !level || level === "none") return null;

  const IconComponent = meta.icon;
  const colorClass = meta.colors[level] || meta.colors.mild;
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <Link
      to={parentGuideBrowsePath(type, level)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${colorClass} text-xs font-medium transition-colors`}
      title={`Browse titles with ${label} · ${levelLabel}`}
    >
      <IconComponent className="text-sm" />
      <span>{label}</span>
      <span className="opacity-70">•</span>
      <span className="opacity-80">{levelLabel}</span>
    </Link>
  );
}

function CertificationBadge({ certification }) {
  if (!certification) return null;

  const getColor = () => {
    const cert = certification.toUpperCase();
    if (["G", "U", "TV-Y", "TV-G"].includes(cert)) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (["PG", "TV-PG", "UA"].includes(cert)) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (["PG-13", "12A", "12", "TV-14"].includes(cert)) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (["R", "15", "MA", "TV-MA", "A"].includes(cert)) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    if (["NC-17", "18", "X"].includes(cert)) return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-white/10 text-white/70 border-white/20";
  };

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${getColor()} text-sm font-bold`}>
      {certification}
    </div>
  );
}

/** Heuristic fallback only when no DB/analysis guide exists. */
function determineContentLevels(certification, genres = []) {
  const genreNames = genres.map((g) => g.name?.toLowerCase() || "");
  const cert = certification?.toUpperCase() || "";

  let guide = {
    violence: "none",
    nudity: "none",
    profanity: "none",
    frightening: "none",
  };

  if (["R", "18", "NC-17", "A", "TV-MA", "X"].includes(cert)) {
    guide.profanity = "moderate";
    guide.violence = "moderate";
  }

  if (["PG-13", "12A", "12", "15", "TV-14", "UA"].includes(cert)) {
    guide.profanity = "mild";
    guide.violence = "mild";
  }

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

  // Never invent sex/nudity from genres or rating — only DB/LLM should set it.
  // (R / romance alone ≠ Sex & Nudity on IMDb-style parents guides.)

  if (genreNames.includes("comedy") && !genreNames.includes("family")) {
    guide.profanity = guide.profanity === "none" ? "mild" : guide.profanity;
  }

  if (genreNames.includes("family") || genreNames.includes("animation")) {
    if (["G", "U", "TV-Y", "TV-G", "PG"].includes(cert)) {
      guide = { violence: "none", nudity: "none", profanity: "none", frightening: "none" };
    }
  }

  return guide;
}

/**
 * Parent Guide — uses DB/analysis levels when present; hides "none";
 * each severity tag links to a browse page of matching titles.
 */
const ParentGuide = ({
  genres = [],
  customParentGuide = null,
  customCertification = null,
}) => {
  const certification = customCertification || null;

  const guide = useMemo(() => {
    const autoGuide = determineContentLevels(certification, genres || []);
    return resolveParentGuide(customParentGuide, autoGuide);
  }, [customParentGuide, certification, genres]);

  const tags = useMemo(() => visibleParentGuideTags(guide), [guide]);
  const isFamilyFriendly = tags.length === 0;

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
          tags.map((tag) => (
            <ParentGuideBadge
              key={tag.key}
              type={tag.key}
              level={tag.level}
              label={tag.label}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ParentGuide;
