import React, { useState, useEffect } from "react";
import axios from "axios";
import Card from "../components/Card";
import { FaGlobe, FaChevronDown, FaFire, FaTv } from "react-icons/fa";
import { useSelector } from "react-redux";

// Available regions
const REGIONS = [
    { code: "IN", name: "India", flag: "🇮🇳" },
    { code: "US", name: "United States", flag: "🇺🇸" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "CA", name: "Canada", flag: "🇨🇦" },
    { code: "AU", name: "Australia", flag: "🇦🇺" },
];

// TV Genre categories with icons
const TV_CATEGORIES = [
    { id: null, name: "All Shows", emoji: "📺" },
    { id: 18, name: "Drama", emoji: "🎭" },
    { id: 35, name: "Comedy", emoji: "😂" },
    { id: 80, name: "Crime", emoji: "🔍" },
    { id: 10765, name: "Sci-Fi & Fantasy", emoji: "🚀" },
    { id: 10759, name: "Action & Adventure", emoji: "💥" },
    { id: 9648, name: "Mystery", emoji: "🕵️" },
    { id: 10751, name: "Family", emoji: "👨‍👩‍👧‍👦" },
    { id: 10764, name: "Reality", emoji: "📹" },
    { id: 99, name: "Documentary", emoji: "🎬" },
    { id: 16, name: "Animation", emoji: "🎨" },
    { id: 10767, name: "Talk Shows", emoji: "🎤" },
];

const TVSeries = () => {
    const [selectedRegion, setSelectedRegion] = useState(REGIONS[0]);
    const [isRegionOpen, setIsRegionOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(TV_CATEGORIES[0]);
    const [trending, setTrending] = useState([]);
    const [categoryShows, setCategoryShows] = useState([]);
    const [loadingTrending, setLoadingTrending] = useState(true);
    const [loadingCategory, setLoadingCategory] = useState(true);

    // Fetch Trending TV Shows
    const fetchTrending = async () => {
        try {
            setLoadingTrending(true);
            const response = await axios.get("/trending/tv/week");
            setTrending(response.data.results.slice(0, 10));
        } catch (error) {
            console.log("Error fetching trending:", error);
        } finally {
            setLoadingTrending(false);
        }
    };

    // Fetch shows by category/genre
    const fetchCategoryShows = async () => {
        try {
            setLoadingCategory(true);
            const params = { language: "en-US", page: 1, sort_by: "popularity.desc" };

            let endpoint = "/discover/tv";
            if (selectedCategory.id) {
                params.with_genres = selectedCategory.id;
            }

            const response = await axios.get(endpoint, { params });
            setCategoryShows(response.data.results.slice(0, 20));
        } catch (error) {
            console.log("Error fetching category shows:", error);
        } finally {
            setLoadingCategory(false);
        }
    };

    useEffect(() => {
        fetchTrending();
    }, []);

    useEffect(() => {
        fetchCategoryShows();
    }, [selectedCategory]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] pt-20 sm:pt-24 pb-24 lg:pb-12">
            <div className="container mx-auto px-3 sm:px-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <FaTv className="text-white text-base sm:text-lg" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">TV Series</h1>
                            <p className="text-xs sm:text-sm text-white/50">Discover trending shows</p>
                        </div>
                    </div>

                    {/* Region Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setIsRegionOpen(!isRegionOpen)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm hover:border-white/20 transition-all"
                        >
                            <span className="text-lg">{selectedRegion.flag}</span>
                            <span className="text-sm hidden sm:inline">{selectedRegion.name}</span>
                            <FaChevronDown className={`text-xs text-white/50 transition-transform ${isRegionOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isRegionOpen && (
                            <div className="absolute top-full mt-2 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-20 min-w-[160px] shadow-2xl">
                                {REGIONS.map((region) => (
                                    <button
                                        key={region.code}
                                        onClick={() => {
                                            setSelectedRegion(region);
                                            setIsRegionOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${selectedRegion.code === region.code ? 'bg-white/10 text-white' : 'text-white/70'
                                            }`}
                                    >
                                        <span className="text-lg">{region.flag}</span>
                                        <span>{region.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Trending Section */}
                <section className="mb-8 sm:mb-12">
                    <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-orange-500/10">
                            <FaFire className="text-orange-400 text-sm sm:text-base" />
                        </div>
                        <h2 className="text-lg sm:text-xl font-semibold text-white">Trending This Week</h2>
                    </div>

                    {loadingTrending ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                            {trending.map((show, index) => (
                                <Card key={show.id} data={show} media_type="tv" index={index} trending={true} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Category Filter Section */}
                <section>
                    <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10">
                            <span className="text-base sm:text-lg">📂</span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-semibold text-white">Browse by Category</h2>
                    </div>

                    {/* Category Pills - Horizontal scroll on mobile */}
                    <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
                        {TV_CATEGORIES.map((category) => (
                            <button
                                key={category.id || 'all'}
                                onClick={() => setSelectedCategory(category)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${selectedCategory.id === category.id
                                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
                                    }`}
                            >
                                <span>{category.emoji}</span>
                                <span className="whitespace-nowrap">{category.name}</span>
                            </button>
                        ))}
                    </div>

                    {/* Category Shows Grid */}
                    <div className="mb-4">
                        <p className="text-sm text-white/40">
                            {selectedCategory.emoji} {selectedCategory.name} • {categoryShows.length} shows
                        </p>
                    </div>

                    {loadingCategory ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                            {[...Array(10)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : categoryShows.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
                            {categoryShows.map((show, index) => (
                                <Card key={show.id} data={show} media_type="tv" index={index} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-white/5 rounded-xl">
                            <p className="text-white/40">No shows found in this category</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default TVSeries;
