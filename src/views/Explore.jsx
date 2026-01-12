import axios from "axios";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Card from "../components/Card";

const ExplorePage = () => {
  const params = useParams();
  const [pageNo, setPageNo] = useState(1);
  const [data, setData] = useState([]);
  const [totalPageNo, setTotalPageNo] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      let endpoint = "";
      let apiParams = {
        api_key: import.meta.env.VITE_MOVIE_API_KEY,
        language: "en-US",
        page: pageNo,
      };

      // Handle different explore types
      if (params.explore === "upcoming") {
        endpoint = "https://api.themoviedb.org/3/movie/upcoming";
      } else {
        endpoint = `https://api.themoviedb.org/3/discover/${params.explore}`;
      }

      const response = await axios.get(endpoint, {
        params: apiParams,
      });

      setData((prev) => {
        return [...prev, ...response.data.results];
      });
      setTotalPageNo(response.data.total_pages);
    } catch (error) {
      console.log("error", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!loading && pageNo < totalPageNo) {
        setPageNo((prev) => prev + 1);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [pageNo]);

  useEffect(() => {
    setPageNo(1);
    setData([]);
    fetchData();
  }, [params.explore]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [loading, pageNo, totalPageNo]);

  const getPageTitle = () => {
    if (params.explore === "upcoming") return "Coming Soon";
    if (params.explore === "movie") return "Movies";
    if (params.explore === "tv") return "TV Shows";
    return params.explore;
  };

  const getPageDescription = () => {
    if (params.explore === "upcoming") return "Upcoming theatrical releases";
    if (params.explore === "movie") return "Discover movies";
    if (params.explore === "tv") return "Discover TV shows";
    return "";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="container mx-auto">
          <div className="max-w-2xl animate-fadeInUp">
            <span className="inline-block px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium mb-6">
              🎬 {getPageTitle()}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4">
              <span className="text-gradient">{getPageTitle()}</span>
            </h1>
            <p className="text-lg text-white/50 max-w-lg">
              {getPageDescription()}
            </p>
          </div>
        </div>

        {/* Decorative gradient orb */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Movies Grid */}
      <section className="px-6 pb-24">
        <div className="container mx-auto">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-10">
            <p className="text-white/40">
              {data?.length || 0} titles found
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {data.map((item, index) => (
              <Card
                key={item.id + params.explore + index}
                data={item}
                media_type={params.explore === "upcoming" ? "movie" : params.explore}
                index={index}
              />
            ))}
          </div>

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-center mt-12">
              <div className="w-8 h-8 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default ExplorePage;
