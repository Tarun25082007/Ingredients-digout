import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
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
  const isMountedRef = useRef(true);

  // Comprehensive table of key formulation disparities across regional markets
  const FORMULATION_FACTORS = useMemo(() => [
    {
      id: 'palm',
      title: 'Oil Quality: Palm Oil vs Unsaturated / Dairy Fat',
      terms: ['palm oil', 'palm fat', 'palmolein', 'palm kernel oil', 'fractionated palm', 'interesterified vegetable fat'],
      descriptionWithBad: 'lists Palm Oil (high in saturated fatty acids ~50%), whereas the other variant relies on unsaturated oils (sunflower/corn) or dairy fat.',
      severity: 3
    },
    {
      id: 'hfcs',
      title: 'Sweetener: High Fructose Corn Syrup vs Cane Sugar',
      terms: ['high fructose corn syrup', 'hfcs', 'glucose-fructose syrup', 'isoglucose', 'corn syrup'],
      descriptionWithBad: 'uses High Fructose Corn Syrup (HFCS), which causes higher hepatic fat deposition and glycemic spikes compared to natural cane sugar or sucrose.',
      severity: 3
    },
    {
      id: 'artificial_dyes',
      title: 'Coloring: Synthetic Petroleum Dyes vs Natural Extracts',
      terms: ['red 40', 'allura red', 'yellow 5', 'tartrazine', 'yellow 6', 'sunset yellow', 'blue 1', 'brilliant blue', 'blue 2', 'red 3', 'e102', 'e110', 'e129', 'e133', 'ins 102', 'ins 110', 'ins 129', 'ins 133'],
      descriptionWithBad: 'uses petroleum-derived synthetic dyes (such as Red 40 or Tartrazine) which require mandatory hyperactivity warning labels in the European Union, while the other variant uses natural plant extracts (paprika, beet, or turmeric).',
      severity: 4
    },
    {
      id: 'synthetic_preservatives',
      title: 'Preservatives: Synthetic (TBHQ / BHA / BHT) vs Natural Antioxidants',
      terms: ['tbhq', 'tertiary butylhydroquinone', 'e319', 'ins 319', 'bha', 'butylated hydroxyanisole', 'e320', 'ins 320', 'bht', 'butylated hydroxytoluene', 'e321', 'ins 321'],
      descriptionWithBad: 'uses synthetic chemical antioxidants (TBHQ/BHA/BHT) to extend shelf life, whereas the other formulation relies on natural tocopherols (Vitamin E) or clean preservation.',
      severity: 3
    },
    {
      id: 'hydrogenated_fats',
      title: 'Lipid Hydrogenation: Trans Fats / Hydrogenated Oils',
      terms: ['partially hydrogenated', 'hydrogenated vegetable oil', 'shortening', 'vanaspati', 'hydrogenated palm'],
      descriptionWithBad: 'contains partially hydrogenated fats or industrial shortening, which are primary sources of artificial trans fats that raise LDL and lower HDL cholesterol.',
      severity: 5
    },
    {
      id: 'bromated_flour',
      title: 'Dough Conditioners: Banned Additives (Bromate / Azodicarbonamide)',
      terms: ['potassium bromate', 'e924', 'azodicarbonamide', 'e927a', 'potassium iodate'],
      descriptionWithBad: 'contains chemical dough conditioners (Potassium Bromate or Azodicarbonamide) which are prohibited across Europe, Canada, and India due to safety concerns.',
      severity: 5
    },
    {
      id: 'titanium_dioxide',
      title: 'Coloring: Titanium Dioxide (E171 - Banned in EU)',
      terms: ['titanium dioxide', 'e171', 'ins 171', 'ci 77891'],
      descriptionWithBad: 'contains Titanium Dioxide (E171), which was banned by the European Food Safety Authority (EFSA) due to genotoxicity concerns.',
      severity: 4
    },
    {
      id: 'flavor_enhancers',
      title: 'Flavor Enhancement: Concentrated MSG & Ribonucleotides',
      terms: ['monosodium glutamate', 'msg', 'e621', 'ins 621', 'disodium inosinate', 'e631', 'ins 631', 'disodium guanylate', 'e627', 'ins 627'],
      descriptionWithBad: 'uses concentrated flavor enhancers (MSG / Ribonucleotides) to artificially heighten savory cravings and hyper-palatability.',
      severity: 3
    },
    {
      id: 'bleached_flour',
      title: 'Flour Treatment: Chemical Bleaching Agents',
      terms: ['bleached flour', 'bleached wheat flour', 'benzoyl peroxide', 'chlorine gas', 'e928'],
      descriptionWithBad: 'uses chemically bleached flour treated with bleaching agents prohibited in the EU, unlike unbleached natural flour.',
      severity: 4
    },
    {
      id: 'artificial_sweeteners',
      title: 'Sweeteners: High-Intensity Non-Sugar Sweeteners (NSS)',
      terms: ['aspartame', 'sucralose', 'acesulfame', 'ace-k', 'saccharin', 'e950', 'e951', 'e954', 'e955', 'ins 950', 'ins 951', 'ins 954', 'ins 955'],
      descriptionWithBad: 'uses high-intensity non-nutritive synthetic sweeteners (Aspartame / Sucralose / Acesulfame-K) which per WHO guidelines should not be used as a means of achieving weight control.',
      severity: 3
    }
  ], []);

  // Compute nutritionally consistent scores across all major formulation differences
  const { effectiveLocalScore, effectiveIntlScore, disparities } = useMemo(() => {
    if (localHealthScore == null) return { effectiveLocalScore: null, effectiveIntlScore: internationalData?.healthScore ?? null, disparities: [] };
    let local = localHealthScore;
    let intl = internationalData?.healthScore ?? null;
    const detectedDisparities = [];

    if (intl != null) {
      const localNames = (Array.isArray(scannedIngredients) ? scannedIngredients : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase());
      const intlNames = (Array.isArray(internationalData.ingredientsFound) ? internationalData.ingredientsFound : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase());

      const hasAny = (list, terms) => list.some(text => terms.some(t => text.includes(t)));

      let localPenalty = 0;
      let intlPenalty = 0;

      FORMULATION_FACTORS.forEach(factor => {
        const localHas = hasAny(localNames, factor.terms);
        const intlHas = hasAny(intlNames, factor.terms);

        if (localHas && !intlHas) {
          localPenalty += factor.severity;
          detectedDisparities.push({
            id: factor.id,
            title: factor.title,
            description: `Your local variant ${factor.descriptionWithBad}`,
            favor: 'intl'
          });
        } else if (!localHas && intlHas) {
          intlPenalty += factor.severity;
          detectedDisparities.push({
            id: factor.id,
            title: factor.title,
            description: `The global variant ${factor.descriptionWithBad}`,
            favor: 'local'
          });
        }
      });

      // Enforce Relative Score Integrity across all formulation factors:
      if (localPenalty > intlPenalty) {
        const netPenalty = Math.max(2, localPenalty - intlPenalty);
        if (local > intl - netPenalty) {
          local = Math.max(0, intl - netPenalty);
        }
      } else if (intlPenalty > localPenalty) {
        const netPenalty = Math.max(2, intlPenalty - localPenalty);
        if (intl > local - netPenalty) {
          intl = Math.max(0, local - netPenalty);
        }
      } else if (localPenalty > 0 && intlPenalty > 0) {
        // Equal cumulative penalties across different synthetic factors (e.g., Local has Palm Oil, Global has HFCS):
        // Both are compromised ultra-processed formulations — equalize them to the lower score so neither falsely appears healthier.
        const floor = Math.min(local, intl);
        local = floor;
        intl = floor;
      }
    }

    return { effectiveLocalScore: local, effectiveIntlScore: intl, disparities: detectedDisparities };
  }, [localHealthScore, internationalData, scannedIngredients, FORMULATION_FACTORS]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (token && productName) {
      const fetchComparison = async () => {
        // Clear stale data from previous scan before loading new one
        setInternationalData(null);
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
          if (!isMountedRef.current) return;
          setInternationalData(response.data);
        } catch (err) {
          if (!isMountedRef.current) return;
          // If primaryTarget was globalEquivalent and failed, fallback to productName
          if (primaryTarget !== productName.trim()) {
            try {
              const response2 = await api.post('/scan/analyze-name', { 
                productName: productName.trim(), 
                countryCode: 'world', 
                saveHistory: 'false', 
                useFastModel: 'true' 
              });
              if (!isMountedRef.current) return;
              setInternationalData(response2.data);
              setLoading(false);
              return;
            } catch (err2) {
              // Fall through to error
            }
          }
          if (!isMountedRef.current) return;
          setError('Failed to load international comparison data. This product might not be listed in the global OpenFoodFacts database.');
          setInternationalData(null);
        } finally {
          if (isMountedRef.current) setLoading(false);
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
        
        {effectiveLocalScore != null && effectiveIntlScore != null && (
          <div className="mt-4 p-3 rounded-xl bg-white/95 border border-emerald-200/80 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 text-xs shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">⚖️</span>
              <span className="font-bold text-gray-800 whitespace-nowrap">Formulation Impact:</span>
            </div>
            <div className="min-w-0 flex items-center justify-end">
              {(() => {
                const diff = effectiveIntlScore - effectiveLocalScore;
                const isBothRedOrPurple = effectiveLocalScore < 55 && effectiveIntlScore < 55;
                const isBothYellow = effectiveLocalScore >= 55 && effectiveLocalScore < 80 && effectiveIntlScore >= 55 && effectiveIntlScore < 80;
                const isBothGreen = effectiveLocalScore >= 80 && effectiveIntlScore >= 80;
                const isPurple = effectiveLocalScore < 30 || effectiveIntlScore < 30;

                if (effectiveLocalScore === effectiveIntlScore) {
                  return (
                    <span className="inline-flex items-center text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 leading-snug text-center">
                      {isBothRedOrPurple
                        ? `Equalized Ultra-Processed Tier (${effectiveLocalScore}/100)`
                        : `Identical Formulation Score (${effectiveLocalScore}/100)`}
                    </span>
                  );
                }

                // When both products fall into the same risk tier and are within statistical tolerance (<= 8 pts)
                if (Math.abs(diff) <= 8 && (isBothRedOrPurple || isBothYellow || isBothGreen)) {
                  return (
                    <span className="inline-flex items-center text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 leading-snug text-center">
                      {isPurple
                        ? `High Risk Profile (${effectiveLocalScore} vs ${effectiveIntlScore})`
                        : isBothRedOrPurple 
                        ? `Both Ultra-Processed (RED: ${effectiveLocalScore} vs ${effectiveIntlScore})`
                        : `Similar Nutritional Profile (${effectiveLocalScore} vs ${effectiveIntlScore})`}
                    </span>
                  );
                }

                if (diff > 0) {
                  return (
                    <span className="inline-flex items-center text-emerald-700 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 leading-snug">
                      Global version +{diff} pts ({effectiveIntlScore} vs {effectiveLocalScore})
                    </span>
                  );
                } else {
                  return (
                    <span className="inline-flex items-center text-blue-700 font-extrabold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 leading-snug">
                      Local version +{Math.abs(diff)} pts ({effectiveLocalScore} vs {effectiveIntlScore})
                    </span>
                  );
                }
              })()}
            </div>
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
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="bg-primary-light text-white w-7 h-7 rounded-full flex items-center justify-center text-sm shadow-sm shrink-0">1</span>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-800 text-base leading-tight">
                      {t('your_scanned_product')}
                    </h4>
                    {productName && (
                      <p className="text-xs text-gray-500 font-medium truncate max-w-[180px] sm:max-w-[240px] md:max-w-[180px] lg:max-w-[260px]">
                        {productName}
                      </p>
                    )}
                  </div>
                </div>
                {effectiveLocalScore != null && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight border shrink-0 ${
                    effectiveLocalScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    effectiveLocalScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    effectiveLocalScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    'bg-purple-100 text-purple-900 border-purple-300'
                  }`}>
                    {effectiveLocalScore}/100
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
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm shadow-sm shrink-0">2</span>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-800 text-base leading-tight">
                      {t('global_version')}
                    </h4>
                    {internationalData && (
                      <p className="text-xs text-gray-500 font-medium truncate max-w-[180px] sm:max-w-[240px] md:max-w-[180px] lg:max-w-[260px]">
                        {internationalData.productName || internationalData.globalEquivalent || globalEquivalent || productName}
                      </p>
                    )}
                  </div>
                </div>
                {effectiveIntlScore != null && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight border shrink-0 ${
                    effectiveIntlScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                    effectiveIntlScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                    effectiveIntlScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    'bg-purple-100 text-purple-900 border-purple-300'
                  }`}>
                    {effectiveIntlScore}/100
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

              {/* Comprehensive Formulation Disparity Insights (Palm, HFCS, Dyes, Preservatives, Trans Fats) */}
              {disparities && disparities.length > 0 && (
                <div className="space-y-3">
                  {disparities.map((disp, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-xl border text-xs flex items-start gap-3 shadow-sm ${
                        disp.favor === 'intl' 
                          ? 'bg-amber-50/90 border-amber-200 text-amber-900' 
                          : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <span className="text-xl shrink-0">{disp.favor === 'intl' ? '⚠️' : '✅'}</span>
                      <div>
                        <span className="font-bold block text-sm mb-0.5">{disp.title}</span>
                        <span>{disp.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default VariantComparison;
