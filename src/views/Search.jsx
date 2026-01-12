import axios from "axios";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { IoSearchOutline } from "react-icons/io5";

const Search = () => {
  const location = useLocation();
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const query = location?.search?.slice(3);
  const displayQuery = query?.split("%20")?.join(" ");

  const fetchData = async () => {
    if (!query) return;

    try {
      setLoading(true);
      const response = await axios.get(`search/multi`, {
        params: {
          query: query,
          page: page,
        },
      });
      setData((prev) => {
        return [...prev, ...response.data.results];
      });
    } catch (error) {
      console.log("error", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query) {
      setPage(1);
      setData([]);
      fetchData();
    }
  }, [location?.search]);

  const handleScroll = () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
      if (!loading) {
        setPage((prev) => prev + 1);
      }
    }
  };

  useEffect(() => {
    if (query && page > 1) {
      fetchData();
    }
  }, [page]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loading]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="relative pt-32 pb-12 px-6">
        <div className="container mx-auto">
          {/* Mobile Search */}
          <div className="lg:hidden mb-8">
            <div className="relative">
              <IoSearchOutline className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-xl" />
              <input
                type="text"
                placeholder="Search movies..."
                onChange={(e) => navigate(`/search?q=${e.target.value}`)}
                value={displayQuery}
                className="w-full bg-white/5 border border-white/10 pl-12 pr-4 py-3 rounded-2xl text-white placeholder:text-white/40 focus:outline-none focus:border-yellow-500/50 transition-smooth"
              />
            </div>
          </div>

          <div className="max-w-2xl animate-fadeInUp">
            <span className="inline-block px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-medium mb-6">
              🔍 Search Results
            </span>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-4">
              {displayQuery ? (
                <>
                  <span className="text-white">Results for </span>
                  <span className="text-gradient">"{displayQuery}"</span>
                </>
              ) : (
                <span className="text-white">Search Movies</span>
              )}
            </h1>
            <p className="text-lg text-white/50">
              {data?.length || 0} results found
            </p>
          </div>
        </div>

        {/* Decorative gradient orb */}
        <div className="absolute top-20 right-0 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Results Grid */}
      <section className="px-6 pb-24">
        <div className="container mx-auto">
          {data.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {data.map((item, index) => (
                <Card
                  key={item.id + "search" + index}
                  data={item}
                  media_type={item.media_type}
                  index={index}
                />
              ))}
            </div>
          ) : !loading && query ? (
            <div className="text-center py-20">
              <p className="text-white/40 text-lg">No results found</p>
              <p className="text-white/20 text-sm mt-2">
                Try searching for something else
              </p>
            </div>
          ) : null}

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

export default Search;
