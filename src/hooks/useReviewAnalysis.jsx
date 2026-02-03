import { useState, useEffect } from 'react';

// This hook previously connected to a Python backend for AI review analysis
// Since the backend is not running, we return empty state gracefully
const useReviewAnalysis = (movieId) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false); // Changed to false since we're not fetching

  useEffect(() => {
    // Backend service is not available, skip fetching
    // The analysis feature requires a separate Python backend running on port 5000
    // For now, return null gracefully without errors
    setAnalysis(null);
    setLoading(false);
  }, [movieId]);

  return { analysis, loading };
};

export default useReviewAnalysis;