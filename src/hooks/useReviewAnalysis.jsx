import { useState, useEffect } from 'react';

const useReviewAnalysis = (movieId) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/analyze/${movieId}`);
        const data = await response.json();
        setAnalysis(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching analysis:', error);
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [movieId]);

  return { analysis, loading };
};

export default useReviewAnalysis;