import React, { useState, useEffect, useContext } from 'react';
import { ShieldAlert, Info, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const translationCache = new Map();

const HealthStatusCard = ({ assessment }) => {
  const { language, t } = useLanguage();
  const { userProfile } = useContext(AuthContext);
  const [activeAssessment, setActiveAssessment] = useState(assessment);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!assessment) {
      setActiveAssessment(null);
      setTranslating(false);
      return;
    }

    // If English, always display original assessment
    if (!language || language.toLowerCase() === 'english') {
      setActiveAssessment(assessment);
      setTranslating(false);
      return;
    }

    // Check if this is a Not Food scan or has no content to translate
    const isNotFoodCheck = 
      assessment.isFood === false || 
      assessment.overallIndicator === 'NOT_FOOD' || 
      (typeof assessment.productName === 'string' && (
        assessment.productName.trim().toLowerCase() === 'not food' ||
        assessment.productName.trim().toLowerCase() === 'not_food' ||
        assessment.productName.trim().toLowerCase() === 'non-food' ||
        assessment.productName.trim().toLowerCase() === 'not a food'
      ));

    if (isNotFoodCheck) {
      setActiveAssessment(assessment);
      setTranslating(false);
      return;
    }

    // Generate unique cache key for assessment + target language
    const cacheKey = `${assessment.productName || 'prod'}_${assessment.healthScore || '0'}_${language}`;
    if (translationCache.has(cacheKey)) {
      setActiveAssessment(translationCache.get(cacheKey));
      setTranslating(false);
      return;
    }

    let isMounted = true;
    setTranslating(true);

    api.post('/scan/translate', { assessment, language })
      .then(res => {
        if (!isMounted) return;
        if (res.data) {
          if (translationCache.size > 50) translationCache.clear();
          translationCache.set(cacheKey, res.data);
          setActiveAssessment(res.data);
        } else {
          setActiveAssessment(assessment);
        }
      })
      .catch(err => {
        if (!isMounted) return;
        console.warn('Failed to dynamically translate assessment:', err);
        setActiveAssessment(assessment);
      })
      .finally(() => {
        if (isMounted) setTranslating(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assessment, language]);

  if (!activeAssessment) return null;

  const { productName, ingredientsFound, whoFlags, overallIndicator, personalizedAlerts, recommendedServingAdvice, healthScore } = activeAssessment;

  // Check if this is a Not Food scan or has no ingredients
  const isNotFood = 
    activeAssessment.isFood === false || 
    overallIndicator === 'NOT_FOOD' || 
    (typeof productName === 'string' && (
      productName.trim().toLowerCase() === 'not food' ||
      productName.trim().toLowerCase() === 'not_food' ||
      productName.trim().toLowerCase() === 'non-food' ||
      productName.trim().toLowerCase() === 'not a food'
    ));

  const hasNoIngredients = 
    (!ingredientsFound || !Array.isArray(ingredientsFound) || ingredientsFound.length === 0) &&
    (!whoFlags || !Array.isArray(whoFlags) || whoFlags.length === 0);

  // If Not Food or completely devoid of ingredients/score, display full grey card with 2 basic lines
  if (isNotFood || (hasNoIngredients && (overallIndicator === 'BLACK' || overallIndicator === 'UNKNOWN' || healthScore == null))) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-gray-100 rounded-xl border border-gray-300 p-8 text-center shadow-sm animate-fadeIn">
        <h2 className="text-xl font-bold text-gray-800">
          {t('no_food_detected')}
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          {t('no_food_detected_desc')}
        </p>
      </div>
    );
  }

  // Determine colors based on indicator
  let bannerClass = "bg-gray-100 text-gray-800 border-gray-300";
  let statusText = t('status_unknown');

  if (overallIndicator === 'PURPLE') {
    bannerClass = "bg-purple-100 text-purple-900 border-purple-300";
    statusText = t('status_purple');
  } else if (overallIndicator === 'RED') {
    bannerClass = "bg-red-100 text-red-800 border-red-300";
    statusText = t('status_red');
  } else if (overallIndicator === 'YELLOW') {
    bannerClass = "bg-yellow-100 text-yellow-800 border-yellow-300";
    statusText = t('status_yellow');
  } else if (overallIndicator === 'GREEN') {
    bannerClass = "bg-green-100 text-green-800 border-green-300";
    statusText = t('status_green');
  }

  const getStatusColor = (statusStr) => {
    if (!statusStr) return 'bg-gray-200 text-gray-800';
    const s = String(statusStr).toUpperCase();
    if (s === 'PURPLE' || s.includes('PURPLE') || s.includes('CONTRAINDICATED') || s.includes('STRICTLY')) {
      return 'bg-purple-100 text-purple-800 border border-purple-300 font-bold';
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

  // Gender-aware safety filter to prevent male users from seeing pregnancy alerts or vice versa
  const activeGender = userProfile?.gender;

  const safePersonalizedAlerts = React.useMemo(() => {
    return (personalizedAlerts || []).filter(a => {
      if (!a) return false;
      const text = ((a.title || '') + ' ' + (a.explanation || '')).toLowerCase();
      if (activeGender === 'MALE' && (text.includes('pregnan') || text.includes('lactat') || text.includes('breastfeed') || text.includes('fetus') || text.includes('maternal') || text.includes('pcos'))) {
        return false;
      }
      if (activeGender === 'FEMALE' && text.includes('prostate')) {
        return false;
      }
      return true;
    });
  }, [personalizedAlerts, activeGender]);

  const safeWhoFlags = React.useMemo(() => {
    return (whoFlags || []).filter(f => {
      if (!f) return false;
      const text = ((f.name || '') + ' ' + (f.explanation || '')).toLowerCase();
      if (activeGender === 'MALE' && (text.includes('pregnan') || text.includes('lactat') || text.includes('breastfeed') || text.includes('maternal') || text.includes('pcos'))) {
        return false;
      }
      if (activeGender === 'FEMALE' && (text.includes('prostate') || (f.name || '').toLowerCase().includes('prostate'))) {
        return false;
      }
      return true;
    });
  }, [whoFlags, activeGender]);

  let safeRecommendedAdvice = recommendedServingAdvice;
  if (activeGender === 'MALE' && typeof safeRecommendedAdvice === 'string') {
    safeRecommendedAdvice = safeRecommendedAdvice
      .replace(/([^.]*?(?:pregnant|pregnancy|lactating|lactation|breastfeeding|pcos)[^.]*\.?)/gi, '')
      .trim();
  } else if (activeGender === 'FEMALE' && typeof safeRecommendedAdvice === 'string') {
    safeRecommendedAdvice = safeRecommendedAdvice
      .replace(/([^.]*?prostate[^.]*\.?)/gi, '')
      .trim();
  }

  const isSevereHazard = overallIndicator === 'PURPLE' || (Array.isArray(safePersonalizedAlerts) && safePersonalizedAlerts.some(a => a?.severity === 'PURPLE'));

  return (
    <div className="w-full max-w-2xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-gray-100 animate-fadeIn relative">
      
      {/* Translation in progress indicator */}
      {translating && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-1.5 flex items-center justify-center space-x-2 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="font-medium">{t('translating_assessment')}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className={`p-6 border-b-4 ${bannerClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold capitalize">
              {productName ? String(productName) : t('status_unknown')}
            </h2>
            
            {/* Quantity and Serving Size */}
            {(activeAssessment.quantity || activeAssessment.servingSize) && (
              <p className="text-sm mt-1 mb-2 font-medium bg-white/20 backdrop-blur-sm inline-block px-3 py-1 rounded-md">
                {activeAssessment.quantity && <span>{t('size_label')}: {String(activeAssessment.quantity)}</span>}
                {activeAssessment.quantity && activeAssessment.servingSize && <span className="mx-2">|</span>}
                {activeAssessment.servingSize && <span>{t('serving_label')}: {String(activeAssessment.servingSize)}</span>}
              </p>
            )}

            <p className="text-sm font-bold mt-2 uppercase tracking-wide">
              {statusText}
            </p>
          </div>

          {/* Hybrid Health Score Gauge */}
          {healthScore != null && (
            <div className="shrink-0 flex flex-row sm:flex-col items-center justify-between sm:justify-center p-3 sm:px-4 sm:py-3 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-white/50 text-gray-900 min-w-[125px]">
              <div className="flex items-baseline">
                <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
                  healthScore >= 80 ? 'text-emerald-600' :
                  healthScore >= 55 ? 'text-amber-600' :
                  healthScore >= 30 ? 'text-orange-600' :
                  'text-purple-700'
                }`}>
                  {healthScore}
                </span>
                <span className="text-xs font-bold text-gray-400 ml-0.5">/100</span>
              </div>
              <div className="text-right sm:text-center ml-3 sm:ml-0 sm:mt-1">
                <span className="block text-[9px] font-extrabold uppercase tracking-widest text-gray-500">
                  {t('health_score_label')}
                </span>
                <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5 uppercase tracking-wide ${
                  healthScore >= 80 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                  healthScore >= 55 ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                  healthScore >= 30 ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                  'bg-purple-50 text-purple-700 border border-purple-200 font-bold'
                }`}>
                  {healthScore >= 80 ? t('optimal') :
                   healthScore >= 55 ? t('moderate') :
                   healthScore >= 30 ? t('high_risk') :
                   t('contraindicated')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* 1. Strict Hazard Warning Banner (for PURPLE) */}
        {isSevereHazard && (
          <div className="p-4 bg-purple-900/85 text-purple-50 rounded-xl border border-purple-400/80 shadow-sm flex items-start space-x-3">
            <span className="text-2xl mt-0.5">⛔</span>
            <div className="flex-1">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-purple-200">
                {t('strict_warning_title')}
              </h4>
              <p className="text-xs text-purple-100 mt-1 font-medium leading-relaxed">
                {activeGender === 'MALE'
                  ? t('strict_warning_male')
                  : (activeGender === 'FEMALE'
                    ? t('strict_warning_female')
                    : t('strict_warning_general'))}
              </p>
            </div>
          </div>
        )}

        {/* 2. Recommended Serving Box */}
        {safeRecommendedAdvice && (
          <div className="p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-lg flex items-center justify-center text-xl">
                🍽️
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-teal-800 uppercase tracking-wider">{t('recommended_serving_for_you')}</h4>
                <p className="text-sm font-extrabold text-teal-950 mt-0.5">{String(safeRecommendedAdvice)}</p>
              </div>
            </div>
          </div>
        )}

        {/* 3. Personalized Alerts Section (if logged in with profile) */}
        {Array.isArray(safePersonalizedAlerts) && safePersonalizedAlerts.length > 0 && (
          <div className="p-5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-purple-700" />
              <h3 className="text-sm font-extrabold text-purple-900 uppercase tracking-wider">{t('personalized_for_profile')}</h3>
            </div>
            
            <div className="space-y-2.5">
              {safePersonalizedAlerts.map((alert, idx) => (
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
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">{t('who_health_assessment')}</h3>
          
          {/* Flags List */}
          {Array.isArray(safeWhoFlags) && safeWhoFlags.length > 0 ? (
            <div className="space-y-3">
              {safeWhoFlags.filter(f => f != null).map((flag, index) => (
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
                  {(flag.dailyLimit || flag.productAmount) && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-1.5 text-[11px]">
                      {flag.dailyLimit && (
                        <span className="inline-flex items-center text-gray-600 font-medium">
                          <span className="font-bold text-gray-700 mr-1">{t('daily_limit')}</span> {flag.dailyLimit}
                        </span>
                      )}
                      {flag.productAmount && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold ${
                          String(flag.productAmount || '').toLowerCase().includes('exceed') || flag.status === 'RED' || flag.status === 'PURPLE'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          <span className="font-bold mr-1">{t('in_this_product')}</span> {flag.productAmount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
              <span className="text-green-600">✅</span>
              <p className="text-green-800 text-xs font-medium">{t('no_concerning_ingredients')}</p>
            </div>
          )}
        </div>

        {/* 5. All Ingredients Detected */}
        {Array.isArray(ingredientsFound) && ingredientsFound.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('all_ingredients_detected')}</h3>
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
                    {(ing.dailyLimit || ing.productAmount) && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-1.5 text-[10px]">
                        {ing.dailyLimit && (
                          <span className="inline-flex items-center text-gray-600 font-medium">
                            <span className="font-bold text-gray-700 mr-1">{t('daily_limit')}</span> {ing.dailyLimit}
                          </span>
                        )}
                        {ing.productAmount && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold ${
                            String(ing.productAmount || '').toLowerCase().includes('exceed') || ing.status === 'RED' || ing.status === 'PURPLE'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            <span className="font-bold mr-1">{t('in_this_product')}</span> {ing.productAmount}
                          </span>
                        )}
                      </div>
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
            <span>{t('ai_assessment_disclaimer')}</span>
          </p>
        </div>

      </div>
    </div>
  );
};

export default HealthStatusCard;
