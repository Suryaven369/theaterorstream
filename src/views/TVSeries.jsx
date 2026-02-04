import React, { useState, useEffect } from "react";
import Card from "../components/Card";
import { FaGlobe, FaChevronDown } from "react-icons/fa";
import { supabase } from "../lib/supabase";

// Available regions for content filtering - matching Home.jsx
const REGIONS = [
    { code: "IN", name: "India", flag: "🇮🇳" },
    { code: "US", name: "United States", flag: "🇺🇸" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "CA", name: "Canada", flag: "🇨🇦" },
    { code: "AU", name: "Australia", flag: "🇦🇺" },
    { code: "DE", name: "Germany", flag: "🇩🇪" },
    { code: "FR", name: "France", flag: "🇫🇷" },
    { code: "JP", name: "Japan", flag: "🇯🇵" },
    { code: "KR", name: "South Korea", flag: "🇰🇷" },
    { code: "BR", name: "Brazil", flag: "🇧🇷" },
];

const TVSeries = () => {
    // Load saved region from localStorage or default to India
    const [selectedRegion, setSelectedRegion] = useState(() => {
        const saved = localStorage.getItem('selectedRegion');
        if (saved) {
            const found = REGIONS.find(r => r.code === saved);
            return found || REGIONS[0];
        }
        return REGIONS[0];
    });
    const [isRegionOpen, setIsRegionOpen] = useState(false);
    const [tvSections, setTvSections] = useState([]);
    const [loadingSections, setLoadingSections] = useState(true);

    // ============================================
    // FETCH TV SECTIONS FROM DATABASE
    // Uses tv_sections table (mirrors homepage_sections for TV)
    // Falls back to homepage_sections if tv_sections doesn't exist
    // ============================================
    useEffect(() => {
        const fetchTvSections = async () => {
            setLoadingSections(true);
            console.log("📺 Fetching TV sections from database...");

            try {
                // First try to fetch from tv_sections table
                let { data: sections, error } = await supabase
                    .from('tv_sections')
                    .select('*')
                    .eq('is_active', true)
                    .order('display_order', { ascending: true });

                // If tv_sections doesn't exist or is empty, fall back to homepage_sections
                // and filter for TV content
                if (error || !sections || sections.length === 0) {
                    console.log("📺 tv_sections not found, falling back to homepage_sections...");

                    const { data: homepageSections, error: hpError } = await supabase
                        .from('homepage_sections')
                        .select('*')
                        .eq('is_active', true)
                        .order('display_order', { ascending: true });

                    if (!hpError && homepageSections) {
                        // Filter sections that have TV content (api_source contains 'tv' or manual with TV shows)
                        sections = homepageSections.filter(s => {
                            const hasTV = s.api_source?.includes('tv') ||
                                s.name?.toLowerCase().includes('tv') ||
                                s.name?.toLowerCase().includes('series') ||
                                s.name?.toLowerCase().includes('netflix') ||
                                s.name?.toLowerCase().includes('prime') ||
                                s.name?.toLowerCase().includes('hotstar');
                            return hasTV;
                        });
                    }
                }

                // Count total TV shows across all regions
                const totalShows = sections?.reduce((acc, s) => {
                    const regionShows = Object.values(s.movies_by_region || {}).flat();
                    return acc + regionShows.length;
                }, 0) || 0;

                console.log(`✅ Loaded ${sections?.length || 0} TV sections with ${totalShows} shows across all regions`);
                setTvSections(sections || []);
            } catch (err) {
                console.error("Error fetching TV sections:", err);
                setTvSections([]);
            }

            setLoadingSections(false);
        };
        fetchTvSections();
    }, []); // Only fetch once on mount

    const handleRegionSelect = (region) => {
        setSelectedRegion(region);
        localStorage.setItem('selectedRegion', region.code);
        setIsRegionOpen(false);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] pb-20 lg:pb-0">
            {/* Header Section with Region */}
            <section className="pt-20 sm:pt-24 pb-6 sm:pb-8 px-4 sm:px-8 md:pl-12 lg:pl-16">
                <div className="container mx-auto">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1 sm:mb-2">
                                <span className="text-gradient">Series</span> <span className="text-white/60">& Shows</span>
                            </h1>
                            <p className="text-sm sm:text-base text-white/50">Trending TV shows on streaming platforms</p>
                        </div>

                        {/* Region Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setIsRegionOpen(!isRegionOpen)}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/30 transition-all"
                            >
                                <FaGlobe className="text-purple-400 text-sm" />
                                <span className="text-xl">{selectedRegion.flag}</span>
                                <span className="text-white text-sm font-medium">{selectedRegion.name}</span>
                                <FaChevronDown className={`text-white/50 text-xs transition-transform ${isRegionOpen ? "rotate-180" : ""}`} />
                            </button>

                            {isRegionOpen && (
                                <div className="absolute top-full right-0 mt-2 w-52 py-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-50 animate-fadeIn">
                                    {REGIONS.map((region) => (
                                        <button
                                            key={region.code}
                                            onClick={() => handleRegionSelect(region)}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-sm ${selectedRegion.code === region.code ? "bg-purple-500/10 text-purple-400" : "text-white"
                                                }`}
                                        >
                                            <span className="text-lg">{region.flag}</span>
                                            <span className="font-medium">{region.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <section className="px-4 sm:px-8 md:pl-12 lg:pl-16 pb-8">
                <div className="container mx-auto">
                    <div className="space-y-8 sm:space-y-12">

                        {/* Loading Skeleton */}
                        {loadingSections && (
                            <div className="space-y-8">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i}>
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />
                                            <div className="w-32 h-6 rounded bg-white/5 animate-pulse" />
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                            {[1, 2, 3, 4, 5].map((j) => (
                                                <div key={j} className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* TV Sections from Database */}
                        {!loadingSections && tvSections
                            .filter(section => {
                                // Only show sections that have content for the selected region
                                const regionShows = section.movies_by_region?.[selectedRegion.code] || [];
                                return regionShows.length > 0;
                            })
                            .map((section) => (
                                <div key={section.id}>
                                    <div className="flex items-center gap-3 mb-6 group">
                                        {/* Icon with shiny background */}
                                        <div className="relative p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <span className="relative text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{section.icon}</span>
                                        </div>

                                        {/* Section Title with Gradient and Animation */}
                                        <div className="flex flex-col">
                                            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-200 group-hover:via-purple-400 group-hover:to-pink-500 transition-all duration-300">
                                                {section.name}
                                            </h2>
                                            {section.description && (
                                                <span className="text-xs sm:text-sm text-white/40 font-medium tracking-wide">
                                                    {section.description}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Get shows for the selected region */}
                                    {(() => {
                                        const regionShows = section.movies_by_region?.[selectedRegion.code] || [];

                                        if (regionShows.length > 0) {
                                            return (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 px-1">
                                                    {regionShows.slice(0, section.max_movies || 10).map((show, index) => (
                                                        <div key={show.tmdb_id} className="transform hover:scale-105 transition-transform duration-300">
                                                            <Card
                                                                data={{
                                                                    id: show.tmdb_id,
                                                                    title: show.title,
                                                                    poster_path: show.poster_path,
                                                                    backdrop_path: show.backdrop_path,
                                                                    media_type: show.media_type || 'tv',
                                                                    vote_average: show.vote_average,
                                                                    release_date: show.release_date || show.first_air_date,
                                                                    overview: show.overview,
                                                                    genres: show.genres,
                                                                    runtime: show.runtime
                                                                }}
                                                                media_type={show.media_type || "tv"}
                                                                index={index}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            ))}

                        {/* No sections message */}
                        {!loadingSections && !tvSections.some(s => (s.movies_by_region?.[selectedRegion.code] || []).length > 0) && (
                            <div className="text-center py-16 px-6">
                                <div className="text-5xl mb-4">{selectedRegion.flag}</div>
                                <h3 className="text-xl font-semibold text-white mb-2">No TV content for {selectedRegion.name}</h3>
                                <p className="text-white/50 text-sm max-w-md mx-auto mb-6">
                                    There are no TV series sections available for this region yet.
                                    Try selecting a different region or add content via the Admin Panel.
                                </p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {REGIONS.filter(r => r.code !== selectedRegion.code).slice(0, 3).map(region => (
                                        <button
                                            key={region.code}
                                            onClick={() => handleRegionSelect(region)}
                                            className="px-4 py-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors text-sm"
                                        >
                                            {region.flag} {region.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default TVSeries;
