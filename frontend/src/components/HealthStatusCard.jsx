import React from 'react';

const HealthStatusCard = ({ assessment }) => {
  if (!assessment) return null;

  const { productName, ingredientsFound, whoFlags, overallIndicator } = assessment;

  // Determine colors based on indicator
  let bannerClass = "bg-gray-100 text-gray-800 border-gray-300";
  let statusText = "UNKNOWN";

  if (overallIndicator === 'RED') {
    bannerClass = "bg-red-100 text-red-800 border-red-300";
    statusText = "AVOID - High Health Risk";
  } else if (overallIndicator === 'YELLOW') {
    bannerClass = "bg-yellow-100 text-yellow-800 border-yellow-300";
    statusText = "CAUTION - Consume in Moderation";
  } else if (overallIndicator === 'GREEN') {
    bannerClass = "bg-green-100 text-green-800 border-green-300";
    statusText = "SAFE - Meets WHO Guidelines";
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 animate-fadeIn">
      {/* Header Banner */}
      <div className={`p-6 border-b-4 ${bannerClass}`}>
        <h2 className="text-2xl font-bold capitalize text-gray-900">
          {productName || "Unknown Product"}
        </h2>
        <p className="text-sm font-bold mt-2 uppercase tracking-wide">
          {statusText}
        </p>
      </div>
      
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">WHO Health Assessment</h3>
        
        {/* Flags List */}
        {whoFlags && whoFlags.length > 0 ? (
          <div className="space-y-4">
            {whoFlags.map((flag, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-md font-extrabold text-gray-800 capitalize">{flag.name}</span>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                    flag.status === 'RED' ? 'bg-red-200 text-red-900' :
                    flag.status === 'YELLOW' ? 'bg-yellow-200 text-yellow-900' :
                    'bg-green-200 text-green-900'
                  }`}>
                    {flag.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{flag.explanation}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
            <span className="text-green-600">✅</span>
            <p className="text-green-800 font-medium">No concerning ingredients flagged based on WHO guidelines.</p>
          </div>
        )}

        {/* Ingredients Found */}
        {ingredientsFound && ingredientsFound.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Raw Ingredients Detected</h3>
            <div className="flex flex-wrap gap-2">
              {ingredientsFound.map((ing, idx) => (
                <span key={idx} className="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-md border border-gray-200">
                  {ing}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthStatusCard;
