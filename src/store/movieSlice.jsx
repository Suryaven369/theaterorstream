// src/store/movieSlice.jsx
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  bannerData: [],
  imageURL: "",
  reviewAnalysisCache: {},
  // ---- Caching layer to avoid repeated DB calls ----
  homepageSections: null,          // cached homepage sections from Supabase
  homepageSectionsTimestamp: null,  // when they were fetched
  movieDetailsCache: {},            // { [movieId]: { data, castData, timestamp } }
  userRatedMovieIds: {},            // { [movieId]: { score } } — movies the signed-in user rated
};

export const movieSlice = createSlice({
  name: "movie",
  initialState,
  reducers: {
    setBannerData: (state, action) => {
      state.bannerData = action.payload;
    },
    setImageURL: (state, action) => {
      state.imageURL = action.payload;
    },
    updateReviewAnalysisCache: (state, action) => {
      state.reviewAnalysisCache[action.payload.movieId] = action.payload.analysis;
    },
    // Homepage sections cache
    setHomepageSections: (state, action) => {
      state.homepageSections = action.payload;
      state.homepageSectionsTimestamp = Date.now();
    },
    // Movie details cache (keyed by movieId)
    cacheMovieDetails: (state, action) => {
      const { movieId, data, castData } = action.payload;
      state.movieDetailsCache[movieId] = { data, castData, timestamp: Date.now() };
    },
    // Invalidate caches when DB changes (Supabase Realtime)
    invalidateHomepageSections: (state) => {
      state.homepageSections = null;
      state.homepageSectionsTimestamp = null;
    },
    invalidateMovieDetails: (state, action) => {
      const movieId = action.payload;
      if (movieId) {
        delete state.movieDetailsCache[movieId];
      } else {
        state.movieDetailsCache = {};
      }
    },
    setUserRatedMovies: (state, action) => {
      state.userRatedMovieIds = action.payload || {};
    },
    markUserRatedMovie: (state, action) => {
      const { movieId, score } = action.payload;
      if (!movieId || score == null) return;
      state.userRatedMovieIds[String(movieId)] = { score };
    },
    patchHomepageMovieTosRating: (state, action) => {
      const { movieId, tos_rating } = action.payload;
      if (!movieId || !tos_rating || !state.homepageSections?.length) return;

      const id = String(movieId);
      state.homepageSections = state.homepageSections.map((section) => {
        if (!section.movies_by_region) return section;

        const moviesByRegion = {};
        Object.keys(section.movies_by_region).forEach((regionCode) => {
          moviesByRegion[regionCode] = (section.movies_by_region[regionCode] || []).map((movie) => {
            if (String(movie.tmdb_id) !== id) return movie;
            return { ...movie, tos_rating };
          });
        });

        return { ...section, movies_by_region: moviesByRegion };
      });
    },
  },
});

export const {
  setBannerData,
  setImageURL,
  updateReviewAnalysisCache,
  setHomepageSections,
  cacheMovieDetails,
  invalidateHomepageSections,
  invalidateMovieDetails,
  setUserRatedMovies,
  markUserRatedMovie,
  patchHomepageMovieTosRating,
} = movieSlice.actions;

export default movieSlice.reducer;