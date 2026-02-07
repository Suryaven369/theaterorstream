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
  },
});

export const { setBannerData, setImageURL, updateReviewAnalysisCache, setHomepageSections, cacheMovieDetails } = movieSlice.actions;

export default movieSlice.reducer;