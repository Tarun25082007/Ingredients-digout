import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Link } from 'react-router-dom';
import api from '../api';

const VariantComparison = ({ scannedIngredients, productName, globalEquivalent, localHealthScore }) => {
  const { token } = useContext(AuthContext);
  const { t } = useLanguage();
  const [internationalData, setInternationalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token && productName) {
      const fetchComparison = async () => {
        setLoading(true);
        setError('');

        // Prioritize specific global equivalent (e.g. "Monster Energy Original") over ambiguous single word ("Monster")
        const primaryTarget = (globalEquivalent && globalEquivalent.trim().length > 0 && globalEquivalent.toLowerCase() !== productName.toLowerCase())
          ? globalEquivalent.trim()
          : productName.trim();

        try {
          const response = await api.post('/scan/analyze-name', { 
            productName: primaryTarget, 
            countryCode: 'world', 
            saveHistory: 'false', 
            useFastModel: 'true' 
          });
          setInternationalData(response.data);
        } catch (err) {
          // If primaryTarget was globalEquivalent and failed, fallback to productName
          if (primaryTarget !== productName.trim()) {
            try {
              const response2 = await api.post('/scan/analyze-name', { 
                productName: productName.trim(), 
                countryCode: 'world', 
                saveHistory: 'false', 
                useFastModel: 'true' 
              });
              setInternationalData(response2.data);
              setLoading(false);
              return;
            } catch (err2) {
              // Fall through to error
            }
          }
          setError('Failed to load international comparison data. This product might not be listed in the global OpenFoodFacts database.');
          setInternationalData(null);
        } finally {
          setLoading(false);
        }
      };
      fetchComparison();
    }
  }, [token, productName, globalEquivalent]);

  // Unauthenticated view - Blurred background with lock overlay
  if (!token) {
    return (
      <div className="mt-8 relative bg-emerald-50/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-200 overflow-hidden group">
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-emerald-50/80 backdrop-blur-sm p-6 text-center transition-all duration-300">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-md border border-emerald-100">
            <span className="text-3xl">🔒</span>
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 mb-2">{t('intl_comp_locked')}</h3>
          <p className="text-gray-700 mb-6 max-w-md font-medium">
            {t('intl_comp_locked_desc')}
          </p>
          <Link to="/login" className="bg-primary-dark hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition transform hover:-translate-y-1">
            {t('login_to_unlock')}
          </Link>
        </div>
        
        {/* Fake blurred background content */}
        <div className="p-8 opacity-30 select-none pointer-events-none">
          <h3 className="text-xl font-bold mb-6 text-gray-800">{t('intl_variant_comp')}</h3>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 bg-white/60 p-6 rounded-xl border border-emerald-200 h-48 shadow-sm"></div>
            <div className="flex-1 bg-white/60 p-6 rounded-xl border border-emerald-200 h-48 shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated View
  return (
    <div className="mt-8 bg-emerald-50/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-200 overflow-hidden">
      <div className="p-6 sm:p-8 border-b border-emerald-200 bg-gradient-to-r from-emerald-100/80 to-emerald-50/80">
        <h3 className="text-2xl font-extrabold text-gray-900">{t('intl_variant_comp')}</h3>
        <p className="text-sm text-gray-600 mt-2 font-medium">{t('intl_variant_comp_desc')}</p>
        
        {localHealthScore != null && internationalData?.healthScore != null && (
          <div className="mt-4 p-3 rounded-xl bg-white/90 border border-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-semibold text-gray-700 shadow-sm">
            <span className="flex items-center gap-1.5">
              <span className="text-base">⚖️</span>
              <span>Comparative Formulation Impact:</span>
            </span>
            <span>
              {(() => {
                const diff = internationalData.healthScore - localHealthScore;
                const isBothRedOrPurple = localHealthScore < 55 && internationalData.healthScore < 55;
                const isBothYellow = localHealthScore >= 55 && localHealthScore < 80 && internationalData.healthScore >= 55 && internationalData.healthScore < 80;
                const isBothGreen = localHealthScore >= 80 && internationalData.healthScore >= 80;
                const isPurple = localHealthScore < 30 || internationalData.healthScore < 30;

                // When both products fall into the same risk tier and are within statistical tolerance (<= 8 pts)
                if (Math.abs(diff) <= 8 && (isBothRedOrPurple || isBothYellow || isBothGreen)) {
                  return (
                    <span className="text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                      {isPurple
                        ? `Comparable high-risk formulation: Both versions contain high stimulants/risk factors (${localHealthScore} vs ${internationalData.healthScore})`
                        : isBothRedOrPurple 
                        ? `Comparable high-risk formulation: Both versions are ultra-processed (RED: ${localHealthScore} vs ${internationalData.healthScore})`
                        : `Comparable formulation: Both versions share similar nutritional profile (${localHealthScore} vs ${internationalData.healthScore})`}
                    </span>
                  );
                }

                if (diff > 0) {
                  return (
                    <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      Global version scores +{diff} pts higher ({internationalData.healthScore} vs {localHealthScore})
                    </span>
                  );
                } else if (diff < 0) {
                  return (
                    <span className="text-blue-700 font-extrabold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                      Local version scores +{Math.abs(diff)} pts higher ({localHealthScore} vs {internationalData.healthScore})
                    </span>
                  );
                } else {
                  return (
                    <span className="text-gray-700 font-extrabold bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                      Identical nutritional formulation score ({localHealthScore}/100)
                    </span>
                  );
                }
              })()}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 sm:p-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-primary-dark rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-700 bg-red-50 p-4 rounded-xl border border-red-200 font-medium text-center">{t('failed_to_load_intl')}</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-8">
            {/* Column 1: Scanned Ingredients */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h4 className="font-bold text-gray-800 flex items-center text-lg">
                  <span className="bg-primary-light text-white w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 shadow-sm">1</span>
                  {t('your_scanned_product')} {productName && `(${productName})`}
                </h4>
                {localHealthScore != null && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight border shrink-0 ${
                    localHealthScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    localHealthScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    localHealthScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    'bg-purple-100 text-purple-900 border-purple-300'
                  }`}>
                    {localHealthScore}/100
                  </span>
                )}
              </div>
              <div className="bg-white/70 p-6 rounded-xl border border-emerald-100 h-64 overflow-y-auto shadow-inner">
                {Array.isArray(scannedIngredients) && scannedIngredients.length > 0 ? (
                  <ul className="space-y-3 text-gray-800">
                    {scannedIngredients.filter(i => i != null).map((ing, idx) => {
                      const text = String((typeof ing === 'string' ? ing : ing?.name) || '');
                      const status = typeof ing === 'string' ? null : ing?.status;
                      const match = text ? (text.match(/(.+)[\s_]+\(?(\d+(?:\.\d+)?\s*(?:%|g|mg|ml|mcg|kcal|l))\)?/i)) : null;

                      const getStatusColor = (statusStr) => {
                        if (!statusStr) return 'bg-gray-200 text-gray-800';
                        const s = String(statusStr).toUpperCase();
                        if (s === 'PURPLE' || s.includes('PURPLE') || s.includes('STRICTLY') || s.includes('CONTRAINDICATED')) return 'bg-purple-900 text-white';
                        if (s === 'UNKNOWN' || s.includes('UNKNOWN') || s.includes('NOT FOUND')) return 'bg-gray-900 text-white';
                        if (s === 'RED' || s.includes('CONCERN')) return 'bg-red-200 text-red-900';
                        if (s === 'YELLOW' || s.includes('CAUTION')) return 'bg-yellow-200 text-yellow-900';
                        if (s === 'GREEN' || s.includes('SAFE')) return 'bg-green-200 text-green-900';
                        return 'bg-gray-900 text-white';
                      };

                      const dailyLimit = typeof ing === 'object' ? ing?.dailyLimit : null;
                      const productAmount = typeof ing === 'object' ? ing?.productAmount : null;
                      const explanation = typeof ing === 'object' ? ing?.explanation : null;

                      return (
                        <li key={idx} className="capitalize flex flex-col border-b border-gray-100 last:border-0 pb-2 mb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{match ? match[1].trim() : text}</span>
                              {status && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                                  {status}
                                </span>
                              )}
                            </div>
                            {match && (
                              <span className="bg-primary-light/10 text-primary-dark text-xs px-2 py-1 rounded-md font-bold ml-2 shrink-0">{match[2]}</span>
                            )}
                          </div>
                          {(dailyLimit || productAmount || explanation) && (
                            <div className="mt-1 text-[11px] text-gray-500 normal-case space-y-0.5 pl-1">
                              {explanation && (
                                <p className="text-gray-600 text-[11px] leading-tight">{explanation}</p>
                              )}
                              {dailyLimit && (
                                <p className="text-gray-500 font-medium">
                                  <span className="font-semibold text-gray-700">Daily Limit:</span> {dailyLimit}
                                </p>
                              )}
                              {productAmount && (
                                <p className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${
                                  String(productAmount || '').toLowerCase().includes('exceed') || status === 'RED' || status === 'PURPLE'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  In this product: {productAmount}
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="list-disc pl-5 space-y-2 text-gray-700 text-sm md:text-base">
                    <li className="text-gray-400 italic list-none">{t('no_ingredients')}</li>
                  </ul>
                )}
              </div>
            </div>

            {/* Column 2: International Data */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4 gap-2">
                <h4 className="font-bold text-gray-800 flex items-center text-lg">
                  <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 shadow-sm">2</span>
                  {t('global_version')} {internationalData && `(${internationalData.productName || internationalData.globalEquivalent || globalEquivalent || productName})`}
                </h4>
                {internationalData?.healthScore != null && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight border shrink-0 ${
                    internationalData.healthScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    internationalData.healthScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    internationalData.healthScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    'bg-purple-100 text-purple-900 border-purple-300'
                  }`}>
                    {internationalData.healthScore}/100
                  </span>
                )}
              </div>
              
              <div className="bg-emerald-100/30 p-6 rounded-xl border border-emerald-100 h-64 overflow-y-auto shadow-inner">
                {Array.isArray(internationalData?.ingredientsFound) && internationalData.ingredientsFound.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-2 text-gray-800 text-sm md:text-base">
                    {internationalData.ingredientsFound.filter(i => i != null).map((ing, idx) => {
                      const text = String((typeof ing === 'string' ? ing : ing?.name) || '');
                      const status = typeof ing === 'string' ? null : ing?.status;
                      const match = text ? (text.match(/(.+)[\s_]+\(?(\d+(?:\.\d+)?\s*(?:%|g|mg|ml|mcg|kcal|l))\)?/i)) : null;

                      const getStatusColor = (statusStr) => {
                        if (!statusStr) return 'bg-blue-100 text-blue-800'; // Default blue for global
                        const s = String(statusStr).toUpperCase();
                        if (s === 'PURPLE' || s.includes('PURPLE') || s.includes('STRICTLY') || s.includes('CONTRAINDICATED')) return 'bg-purple-900 text-white';
                        if (s === 'UNKNOWN' || s.includes('UNKNOWN') || s.includes('NOT FOUND')) return 'bg-gray-900 text-white';
                        if (s === 'RED' || s.includes('CONCERN')) return 'bg-red-200 text-red-900';
                        if (s === 'YELLOW' || s.includes('CAUTION')) return 'bg-yellow-200 text-yellow-900';
                        if (s === 'GREEN' || s.includes('SAFE')) return 'bg-green-200 text-green-900';
                        return 'bg-blue-100 text-blue-800';
                      };

                      const dailyLimit = typeof ing === 'object' ? ing?.dailyLimit : null;
                      const productAmount = typeof ing === 'object' ? ing?.productAmount : null;
                      const explanation = typeof ing === 'object' ? ing?.explanation : null;

                      return (
                        <li key={idx} className="capitalize flex flex-col border-b border-blue-100 last:border-0 pb-2 mb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span>{match ? match[1].trim() : text}</span>
                              {status && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                                  {String(status)}
                                </span>
                              )}
                            </div>
                            {match && (
                              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-md font-bold shrink-0">{match[2]}</span>
                            )}
                          </div>
                          {(dailyLimit || productAmount || explanation) && (
                            <div className="mt-1 text-[11px] text-gray-500 normal-case space-y-0.5 pl-1">
                              {explanation && (
                                <p className="text-gray-600 text-[11px] leading-tight">{explanation}</p>
                              )}
                              {dailyLimit && (
                                <p className="text-gray-500 font-medium">
                                  <span className="font-semibold text-gray-700">Daily Limit:</span> {dailyLimit}
                                </p>
                              )}
                              {productAmount && (
                                <p className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${
                                  String(productAmount || '').toLowerCase().includes('exceed') || status === 'RED' || status === 'PURPLE'
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  In this product: {productAmount}
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-blue-400">
                    <span className="text-4xl mb-3">🌍</span>
                    <p className="italic text-sm">
                      {productName ? t('not_in_db') : t('scan_to_fetch')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Intelligent Formulation & Variant Disparity Insights */}
          {internationalData && (
            <div className="mt-6 space-y-4">
              {/* Variant Disparity Inspector Warning */}
              {(() => {
                const localNames = (Array.isArray(scannedIngredients) ? scannedIngredients : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase());
                const intlNames = (Array.isArray(internationalData.ingredientsFound) ? internationalData.ingredientsFound : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase());
                const hasTerm = (list, terms) => list.some(text => terms.some(t => text.includes(t)));

                const sugarTerms = ['sugar', 'sucrose', 'glucose', 'fructose', 'cane sugar', 'corn syrup', 'dextrose', 'invert sugar', 'sucre'];
                const nssTerms = ['aspartame', 'sucralose', 'acesulfame', 'ace-k', 'stevia', 'saccharin', 'erythritol', 'cyclamate', 'monk fruit'];

                const localHasSugar = hasTerm(localNames, sugarTerms);
                const localHasNSS = hasTerm(localNames, nssTerms);
                const intlHasSugar = hasTerm(intlNames, sugarTerms);
                const intlHasNSS = hasTerm(intlNames, nssTerms);

                const isSugarVsDiet = (localHasSugar && !localHasNSS && intlHasNSS && !intlHasSugar) || (!localHasSugar && localHasNSS && !intlHasNSS && intlHasSugar);

                const bakedTerms = ['baked', 'air popped', 'air-popped', 'oven baked'];
                const localBaked = hasTerm(localNames, bakedTerms) || (productName && bakedTerms.some(t => productName.toLowerCase().includes(t)));
                const intlBaked = hasTerm(intlNames, bakedTerms) || (internationalData.productName && bakedTerms.some(t => internationalData.productName.toLowerCase().includes(t)));
                const isBakedMismatch = localBaked !== intlBaked;

                const decafTerms = ['decaf', 'decaffeinated', 'caffeine-free', 'caffeine free', 'sans cafeine'];
                const localDecaf = hasTerm(localNames, decafTerms) || (productName && decafTerms.some(t => productName.toLowerCase().includes(t)));
                const intlDecaf = hasTerm(intlNames, decafTerms) || (internationalData.productName && decafTerms.some(t => internationalData.productName.toLowerCase().includes(t)));
                const isDecafMismatch = localDecaf !== intlDecaf;

                if (isSugarVsDiet || isBakedMismatch || isDecafMismatch) {
                  return (
                    <div className="p-4 rounded-xl bg-purple-50/95 border border-purple-200 text-xs text-purple-950 flex items-start gap-3 shadow-sm">
                      <span className="text-xl shrink-0">🔍</span>
                      <div>
                        <span className="font-bold block text-sm mb-1 text-purple-900">
                          {isSugarVsDiet ? 'Sub-Variant Detected: Full Sugar vs Zero Sugar / Diet' : isBakedMismatch ? 'Sub-Variant Detected: Baked vs Fried' : 'Sub-Variant Detected: Caffeinated vs Decaf'}
                        </span>
                        <span className="leading-relaxed">
                          {isSugarVsDiet && 'One product is a standard Full-Sugar beverage/food while the other is a Zero-Sugar / Diet variant sweetened with Non-Sugar Sweeteners (NSS). Differing health scores reflect distinct sub-product lines rather than a direct regional reformulatory change.'}
                          {isBakedMismatch && 'Comparing a Baked variant against a Standard / Fried variant. Nutritional and fat values differ primarily due to the distinct preparation method.'}
                          {isDecafMismatch && 'Comparing a Caffeinated product against a Decaffeinated variant.'}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Oil Formulation Difference Callout */}
              {(() => {
                const hasLocalPalm = Array.isArray(scannedIngredients) && scannedIngredients.some(i => {
                  const name = String((typeof i === 'string' ? i : i?.name) || '').toLowerCase();
                  return name.includes('palm');
                });
                const hasIntlPalm = Array.isArray(internationalData.ingredientsFound) && internationalData.ingredientsFound.some(i => {
                  const name = String((typeof i === 'string' ? i : i?.name) || '').toLowerCase();
                  return name.includes('palm');
                });

                if (hasLocalPalm && !hasIntlPalm) {
                  return (
                    <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
                      <span className="text-xl shrink-0">⚠️</span>
                      <div>
                        <span className="font-bold block text-sm mb-0.5">Key Oil Formulation Difference</span>
                        <span>Your local variant lists <strong>Palm Oil</strong> (high in saturated fatty acids ~50%), whereas the global variant relies on alternative or unsaturated vegetable oils (e.g. sunflower/corn). Saturated fats raise LDL cholesterol and cardiovascular risk.</span>
                      </div>
                    </div>
                  );
                } else if (!hasLocalPalm && hasIntlPalm) {
                  return (
                    <div className="p-4 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3 shadow-sm">
                      <span className="text-xl shrink-0">✅</span>
                      <div>
                        <span className="font-bold block text-sm mb-0.5">Key Oil Formulation Difference</span>
                        <span>The global variant lists <strong>Palm Oil</strong>, while your local variant avoids pure palm oil, giving your local version a more favorable fatty acid profile.</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default VariantComparison;
