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
            <div className="container mx-auto px-4 sm:px-8 md:pl-12 lg:pl-16">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-8 sm:mb-10">
                    <div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2">
                            Discover <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">TV Series</span>
                        </h1>
                        <p className="text-sm sm:text-base text-white/50">Binge-worthy shows trending worldwide</p>
                    </div>

                    {/* Region Selector */}
                    <div className="relative">
                        <button
                            onClick={() => setIsRegionOpen(!isRegionOpen)}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:border-purple-500/30 transition-all"
                        >
                            <span className="text-xl">{selectedRegion.flag}</span>
                            <span className="font-medium hidden sm:inline">{selectedRegion.name}</span>
                            <FaChevronDown className={`text-xs text-white/50 transition-transform ${isRegionOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isRegionOpen && (
                            <div className="absolute top-full mt-2 right-0 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-20 min-w-[180px] shadow-2xl animate-fade-in">
                                {REGIONS.map((region) => (
                                    <button
                                        key={region.code}
                                        onClick={() => {
                                            setSelectedRegion(region);
                                            setIsRegionOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors ${selectedRegion.code === region.code ? 'bg-purple-500/10 text-purple-400' : 'text-white/70'
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
                <section className="mb-10 sm:mb-14">
                    <div className="flex items-center gap-3 mb-6 group">
                        {/* Icon with shiny background */}
                        <div className="relative p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <FaFire className="relative text-xl sm:text-2xl text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" />
                        </div>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-orange-400 group-hover:to-red-500 transition-all duration-300">
                            Trending This Week
                        </h2>
                    </div>

                    {loadingTrending ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 sm:gap-6 px-1">
                            {[...Array(7)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 sm:gap-6 px-1">
                            {trending.map((show, index) => (
                                <div key={show.id} className="transform hover:scale-105 transition-transform duration-300">
                                    <Card data={show} media_type="tv" index={index} trending={true} mini={true} />
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Category Filter Section */}
                <section>
                    <div className="flex items-center gap-3 mb-6 group">
                        <div className="relative p-2 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            <span className="relative text-xl sm:text-2xl drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]">📂</span>
                        </div>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-pink-500 transition-all duration-300">
                            Browse by Category
                        </h2>
                    </div>

                    {/* Category Pills - Horizontal scroll on mobile */}
                    <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                        {TV_CATEGORIES.map((category) => (
                            <button
                                key={category.id || 'all'}
                                onClick={() => setSelectedCategory(category)}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${selectedCategory.id === category.id
                                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25 scale-105'
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10 hover:border-white/20'
                                    }`}
                            >
                                <span className="text-base">{category.emoji}</span>
                                <span className="whitespace-nowrap">{category.name}</span>
                            </button>
                        ))}
                    </div>

                    {/* Category Shows Grid */}
                    <div className="mb-6 px-1">
                        <p className="text-sm font-medium text-white/50 flex items-center gap-2">
                            <span className="text-lg">{selectedCategory.emoji}</span>
                            {selectedCategory.name}
                            <span className="w-1 h-1 rounded-full bg-white/30"></span>
                            {categoryShows.length} shows
                        </p>
                    </div>

                    {loadingCategory ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 sm:gap-6 px-1">
                            {[...Array(14)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="aspect-[2/3] bg-white/5 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : categoryShows.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 sm:gap-6 px-1">
                            {categoryShows.map((show, index) => (
                                <div key={show.id} className="transform hover:scale-105 transition-transform duration-300">
                                    <Card data={show} media_type="tv" index={index} mini={true} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
                            <div className="text-4xl mb-3">😕</div>
                            <h3 className="text-lg font-medium text-white mb-1">No shows found</h3>
                            <p className="text-white/40 text-sm">Try selecting a different category</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default TVSeries;
