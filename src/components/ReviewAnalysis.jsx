import React from 'react';
import Divider from './Divider';

const ReviewAnalysis = ({ analysis, loading }) => {
  if (loading) {
    return <div className="mt-4 text-white">Loading review analysis...</div>;
  }

  if (!analysis) {
    return null;
  }

  const { ratings, verdict } = analysis;

  return (
    <div className="mt-4">
      <h3 className="text-xl font-bold text-white mb-2">Review Analysis</h3>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(ratings).map(([category, rating]) => (
          <div key={category} className="flex justify-between text-white">
            <span className="capitalize">{category.replace(/([A-Z])/g, ' $1').trim()}:</span>
            <span>{rating.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <Divider />
      <div className="mt-2 text-white font-bold">
        Verdict: {verdict}
      </div>
    </div>
  );
};

export default ReviewAnalysis;