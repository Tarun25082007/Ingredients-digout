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

  const getStatusColor = (statusStr) => {
    if (!statusStr) return 'bg-gray-200 text-gray-800';
    const s = String(statusStr).toUpperCase();
    if (s === 'UNKNOWN' || s.includes('UNKNOWN') || s.includes('NOT FOUND')) {
      return 'bg-gray-900 text-white';
    }
    if (s === 'RED' || s.includes('CONCERN') || s.includes('AVOID') || s.includes('DANGER') || s.includes('HIGH')) {
      return 'bg-red-200 text-red-900';
    }
    if (s === 'YELLOW' || s.includes('MODERATE') || s.includes('CAUTION') || s.includes('PRESERVATIVE') || s.includes('ADDITIVE')) {
      return 'bg-yellow-200 text-yellow-900';
    }
    if (s === 'GREEN' || s.includes('SAFE')) {
      return 'bg-green-200 text-green-900';
    }
    // Default fallback if it doesn't match known statuses
    return 'bg-gray-900 text-white';
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 animate-fadeIn">
      {/* Header Banner */}
      <div className={`p-6 border-b-4 ${bannerClass}`}>
        <h2 className="text-2xl font-bold capitalize text-gray-900">
          {productName ? String(productName) : "Unknown Product"}
        </h2>
        
        {/* Quantity and Serving Size */}
        {(assessment.quantity || assessment.servingSize) && (
          <p className="text-sm text-gray-700 mt-1 mb-2 font-medium bg-white/50 inline-block px-3 py-1 rounded-md">
            {assessment.quantity && <span>Size: {String(assessment.quantity)}</span>}
            {assessment.quantity && assessment.servingSize && <span className="mx-2">|</span>}
            {assessment.servingSize && <span>Serving: {String(assessment.servingSize)}</span>}
          </p>
        )}

        <p className="text-sm font-bold mt-2 uppercase tracking-wide">
          {statusText}
        </p>
      </div>
      
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">WHO Health Assessment</h3>
        
        {/* Flags List */}
        {Array.isArray(whoFlags) && whoFlags.length > 0 ? (
          <div className="space-y-4">
            {whoFlags.filter(f => f != null).map((flag, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="text-md font-extrabold text-gray-800 capitalize">{String(flag.name || '')}</span>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${getStatusColor(flag.status)}`}>
                    {String(flag.status || 'UNKNOWN')}
                  </span>
                </div>
                {flag.explanation && (
                  <p className="text-sm text-gray-600 mt-2 leading-snug">{String(flag.explanation)}</p>
                )}</div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
            <span className="text-green-600">✅</span>
            <p className="text-green-800 font-medium">No concerning ingredients flagged based on WHO guidelines.</p>
          </div>
        )}

        {/* Ingredients Found */}
        {Array.isArray(ingredientsFound) && ingredientsFound.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">All Ingredients Detected</h3>
            <div className="space-y-3">
              {ingredientsFound.filter(i => i != null).map((ing, idx) => {
                // Backwards compatibility: if it's just a string from old history
                if (typeof ing === 'string') {
                  return (
                    <span key={idx} className="inline-block bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-md border border-gray-200 mr-2 mb-2">
                      {ing}
                    </span>
                  );
                }
                
                // New format: Detailed ingredient object
                return (
                  <div key={idx} className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-800 capitalize">{String(ing.name || '')}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusColor(ing.status)}`}>
                        {String(ing.status || 'UNKNOWN')}
                      </span>
                    </div>
                    {ing.explanation && (
                      <p className="text-xs text-gray-600 leading-relaxed">{String(ing.explanation)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthStatusCard;
