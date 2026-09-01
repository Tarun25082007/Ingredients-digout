import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const HealthStatusCard = ({ assessment }) => {
  if (!assessment) return null;

  const { productName, ingredientsFound, whoFlags, overallIndicator, personalizedAlerts, recommendedServingAdvice } = assessment;

  // Determine colors based on indicator
  let bannerClass = "bg-gray-100 text-gray-800 border-gray-300";
  let statusText = "UNKNOWN";

  if (overallIndicator === 'PURPLE') {
    bannerClass = "bg-purple-950 text-purple-100 border-purple-600";
    statusText = "⛔ HIGH HAZARD - STRICTLY NOT RECOMMENDED FOR YOUR HEALTH PROFILE";
  } else if (overallIndicator === 'RED') {
    bannerClass = "bg-red-100 text-red-800 border-red-300";
    statusText = "AVOID - High Health Risk";
  } else if (overallIndicator === 'YELLOW') {
    bannerClass = "bg-yellow-100 text-yellow-800 border-yellow-300";
    statusText = "CAUTION - Consume in Moderation";
  } else if (overallIndicator === 'GREEN') {
    bannerClass = "bg-green-100 text-green-800 border-green-300";
    statusText = "SAFE - Meets Health & WHO Guidelines";
  }

  const getStatusColor = (statusStr) => {
    if (!statusStr) return 'bg-gray-200 text-gray-800';
    const s = String(statusStr).toUpperCase();
    if (s === 'PURPLE' || s.includes('PURPLE') || s.includes('CONTRAINDICATED') || s.includes('STRICTLY')) {
      return 'bg-purple-900 text-white border border-purple-400 font-extrabold shadow-sm';
    }
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
    return 'bg-gray-900 text-white';
  };

  const isSevereHazard = overallIndicator === 'PURPLE' || (Array.isArray(personalizedAlerts) && personalizedAlerts.some(a => a?.severity === 'PURPLE'));

  return (
    <div className="w-full max-w-2xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 animate-fadeIn">
      {/* Header Banner */}
      <div className={`p-6 border-b-4 ${bannerClass}`}>
        <h2 className="text-2xl font-bold capitalize">
          {productName ? String(productName) : "Unknown Product"}
        </h2>
        
        {/* Quantity and Serving Size */}
        {(assessment.quantity || assessment.servingSize) && (
          <p className="text-sm mt-1 mb-2 font-medium bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-md">
            {assessment.quantity && <span>Size: {String(assessment.quantity)}</span>}
            {assessment.quantity && assessment.servingSize && <span className="mx-2">|</span>}
            {assessment.servingSize && <span>Serving: {String(assessment.servingSize)}</span>}
          </p>
        )}

        <p className="text-sm font-bold mt-2 uppercase tracking-wide">
          {statusText}
        </p>
      </div>
      
      <div className="p-6 space-y-6">

        {/* 1. Strict Hazard Warning Banner (for PURPLE) */}
        {isSevereHazard && (
          <div className="p-4 bg-purple-950 text-white rounded-xl border-2 border-purple-500 shadow-md flex items-start space-x-3">
            <span className="text-2xl mt-0.5">⛔</span>
            <div className="flex-1">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-purple-300">
                Strict Medical & Health Profile Warning
              </h4>
              <p className="text-xs text-purple-100 mt-1 font-medium leading-relaxed">
                This food contains ingredients that pose severe direct risks for your medical conditions, pregnancy, or dietary profile. Consumption is strictly not recommended.
              </p>
            </div>
          </div>
        )}

        {/* 2. Recommended Serving Box */}
        {recommendedServingAdvice && (
          <div className="p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center text-xl">
                🍽️
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">Recommended Serving For You</h4>
                <p className="text-sm font-extrabold text-teal-950 mt-0.5">{String(recommendedServingAdvice)}</p>
              </div>
            </div>
          </div>
        )}

        {/* 3. Personalized Alerts Section (if logged in with profile) */}
        {Array.isArray(personalizedAlerts) && personalizedAlerts.length > 0 && (
          <div className="p-5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-purple-700" />
              <h3 className="text-sm font-extrabold text-purple-900 uppercase tracking-wider">Personalized For Your Profile</h3>
            </div>
            
            <div className="space-y-2.5">
              {personalizedAlerts.filter(a => a != null).map((alert, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-purple-100 shadow-sm flex items-start justify-between">
                  <div className="flex-1 mr-3">
                    <h5 className="font-bold text-xs text-gray-900">{alert.title}</h5>
                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{alert.explanation}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 ${getStatusColor(alert.severity)}`}>
                    {String(alert.severity || 'CAUTION')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. WHO Health Assessment Section */}
        <div>
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">WHO Health Assessment</h3>
          
          {/* Flags List */}
          {Array.isArray(whoFlags) && whoFlags.length > 0 ? (
            <div className="space-y-3">
              {whoFlags.filter(f => f != null).map((flag, index) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-sm transition">
                  <div className="flex items-center space-x-3 mb-1.5">
                    <span className="text-sm font-extrabold text-gray-800 capitalize">{String(flag.name || '')}</span>
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusColor(flag.status)}`}>
                      {String(flag.status || 'UNKNOWN')}
                    </span>
                  </div>
                  {flag.explanation && (
                    <p className="text-xs text-gray-600 leading-snug">{String(flag.explanation)}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
              <span className="text-green-600">✅</span>
              <p className="text-green-800 text-xs font-medium">No concerning ingredients flagged based on standard WHO guidelines.</p>
            </div>
          )}
        </div>

        {/* 5. All Ingredients Detected */}
        {Array.isArray(ingredientsFound) && ingredientsFound.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">All Ingredients Detected</h3>
            <div className="space-y-2">
              {ingredientsFound.filter(i => i != null).map((ing, idx) => {
                if (typeof ing === 'string') {
                  return (
                    <span key={idx} className="inline-block bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-md border border-gray-200 mr-2 mb-2">
                      {ing}
                    </span>
                  );
                }
                
                return (
                  <div key={idx} className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-gray-800 capitalize">{String(ing.name || '')}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusColor(ing.status)}`}>
                        {String(ing.status || 'UNKNOWN')}
                      </span>
                    </div>
                    {ing.explanation && (
                      <p className="text-[11px] text-gray-500 leading-relaxed">{String(ing.explanation)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subtle AI Disclaimer */}
        <div className="pt-4 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400 flex items-center justify-center space-x-1">
            <Info className="w-3.5 h-3.5 mr-1 text-gray-400" />
            <span>AI-generated health assessment. AI can make mistakes — always consult a healthcare professional.</span>
          </p>
        </div>

      </div>
    </div>
  );
};

export default HealthStatusCard;
