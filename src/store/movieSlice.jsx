// src/store/movieSlice.jsx
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  bannerData: [],
  imageURL: "",
  reviewAnalysisCache: {},
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
  },
});

export const { setBannerData, setImageURL, updateReviewAnalysisCache } = movieSlice.actions;

export default movieSlice.reducer;