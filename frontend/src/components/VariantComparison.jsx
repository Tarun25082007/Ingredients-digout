import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Link } from 'react-router-dom';
import api from '../api';

// Helper to match terms with word/delimiter boundaries to prevent false positive substring collisions
// (e.g. Prevents "Pav Bhaji" or "Bhavnagari" from matching synthetic preservative acronym "bha")
export const matchesTerm = (text, term) => {
  if (!text || !term) return false;
  const escaped = String(term).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i').test(text);
};

export const hasAnyTerm = (list, terms) => {
  if (!Array.isArray(list) || !Array.isArray(terms)) return false;
  return list.some(text => terms.some(t => matchesTerm(text, t)));
};

const extractAllTexts = (ingredients, flags) => {
  const texts = [];
  if (Array.isArray(ingredients)) {
    ingredients.forEach(item => {
      if (!item) return;
      if (typeof item === 'string') {
        texts.push(item.toLowerCase());
      } else {
        if (item.name) texts.push(String(item.name).toLowerCase());
        if (item.explanation) texts.push(String(item.explanation).toLowerCase());
      }
    });
  }
  if (Array.isArray(flags)) {
    flags.forEach(flag => {
      if (!flag) return;
      if (typeof flag === 'string') {
        texts.push(flag.toLowerCase());
      } else {
        if (flag.name) texts.push(String(flag.name).toLowerCase());
        if (flag.explanation) texts.push(String(flag.explanation).toLowerCase());
      }
    });
  }
  return texts;
};

// Helper to determine if the compared international product is the same branded item or a category equivalent
export const checkIsSameProduct = (localName, intlName, globalEquiv) => {
  if (!localName) return true;
  const targetIntl = (intlName || globalEquiv || '').trim();
  const targetLocal = localName.trim();
  if (!targetIntl) return true;

  const normalize = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normLocal = normalize(targetLocal);
  const normIntl = normalize(targetIntl);

  if (normLocal === normIntl) return true;

  // Generic category and descriptor words that don't indicate same brand
  const genericCategoryWords = new Set([
    'chips', 'crisps', 'potato', 'potatoes', 'snack', 'snacks', 'original', 'style',
    'flavored', 'flavour', 'flavours', 'flavor', 'spicy', 'hot', 'salted', 'salt',
    'sweet', 'sour', 'cream', 'onion', 'chili', 'chilli', 'masala', 'biscuit', 'biscuits',
    'cookie', 'cookies', 'crackers', 'cracker', 'noodles', 'noodle', 'instant', 'sauce',
    'drink', 'beverage', 'water', 'juice', 'soda', 'cola', 'bars', 'bar', 'cereal',
    'puffed', 'corn', 'rice', 'wheat', 'dairy', 'milk', 'cheese', 'butter', 'oil',
    'bread', 'bun', 'cake', 'candy', 'chocolate', 'tea', 'coffee', 'classic', 'crunchy',
    'korean', 'indian', 'american', 'mexican', 'british', 'asian', 'inspired'
  ]);

  const extractBrandTokens = (str) => {
    return str.split(' ').filter(w => w.length > 2 && !genericCategoryWords.has(w));
  };

  const localBrandTokens = extractBrandTokens(normLocal);
  const intlBrandTokens = extractBrandTokens(normIntl);

  // If local has brand tokens, check overlap
  if (localBrandTokens.length > 0 && intlBrandTokens.length > 0) {
    return localBrandTokens.some(token => intlBrandTokens.includes(token));
  }

  // If local has distinctive brand tokens but intl is a generic category name (e.g. "Spicy Potato Chips")
  if (localBrandTokens.length > 0 && intlBrandTokens.length === 0) {
    return false;
  }

  // If one string contains the other string directly
  if (normLocal.includes(normIntl) || normIntl.includes(normLocal)) {
    const words = normIntl.split(' ');
    if (words.length >= 2 || (words.length === 1 && words[0].length > 5)) {
      return true;
    }
  }

  return false;
};

export const getIngredientStatusColor = (statusStr) => {
  if (!statusStr) return 'bg-gray-100 text-gray-700 border border-gray-200';
  const s = String(statusStr).toUpperCase();
  if (s === 'PURPLE' || s.includes('PURPLE') || s.includes('STRICTLY') || s.includes('CONTRAINDICATED')) {
    return 'bg-purple-100 text-purple-700 border border-purple-200 font-bold';
  }
  if (s === 'UNKNOWN' || s.includes('UNKNOWN') || s.includes('NOT FOUND')) {
    return 'bg-gray-900 text-white border border-black';
  }
  if (s === 'RED' || s.includes('CONCERN')) {
    return 'bg-red-100 text-red-800 border border-red-200';
  }
  if (s === 'YELLOW' || s.includes('CAUTION')) {
    return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
  }
  if (s === 'GREEN' || s.includes('SAFE')) {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  }
  return 'bg-gray-100 text-gray-700 border border-gray-200';
};

const VariantComparison = ({ scannedIngredients, productName, globalEquivalent, localHealthScore, localWhoFlags }) => {
  const { token } = useContext(AuthContext);
  const { t, language } = useLanguage();
  const [internationalData, setInternationalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isMountedRef = useRef(true);

  const intlDisplayName = useMemo(() => {
    if (!internationalData) return '';
    return internationalData.productName || internationalData.globalEquivalent || globalEquivalent || productName || '';
  }, [internationalData, globalEquivalent, productName]);

  const isSameProduct = useMemo(() => {
    if (!productName || !internationalData) return true;
    return checkIsSameProduct(productName, intlDisplayName, globalEquivalent);
  }, [productName, intlDisplayName, globalEquivalent, internationalData]);

  // Comprehensive table of key formulation disparities across regional markets
  const FORMULATION_FACTORS = useMemo(() => [
    {
      id: 'palm',
      title: 'Oil Quality: Palm Oil vs Unsaturated / Dairy Fat',
      terms: ['palm', 'palm oil', 'palm fat', 'palmolein', 'palm kernel oil', 'fractionated palm', 'interesterified vegetable fat', 'palm olein', 'palm stearin', 'interesterified palm'],
      descriptionWithBad: 'lists Palm Oil (high in saturated fatty acids ~50%), whereas the other variant relies on unsaturated oils (sunflower/corn) or dairy fat.',
      severity: 3
    },
    {
      id: 'hfcs',
      title: 'Sweetener: High Fructose Corn Syrup vs Cane Sugar',
      terms: ['high fructose corn syrup', 'hfcs', 'glucose-fructose syrup', 'glucose fructose syrup', 'glucose-fructose', 'isoglucose', 'corn syrup'],
      descriptionWithBad: 'uses High Fructose Corn Syrup (HFCS), which causes higher hepatic fat deposition and glycemic spikes compared to natural cane sugar or sucrose.',
      severity: 3
    },
    {
      id: 'artificial_dyes',
      title: 'Coloring: Synthetic Petroleum Dyes vs Natural Extracts',
      terms: ['red 40', 'allura red', 'yellow 5', 'tartrazine', 'yellow 6', 'sunset yellow', 'blue 1', 'brilliant blue', 'blue 2', 'red 3', 'e102', 'e110', 'e129', 'e133', 'ins 102', 'ins 110', 'ins 129', 'ins 133', 'synthetic color', 'artificial color'],
      descriptionWithBad: 'uses petroleum-derived synthetic dyes (such as Red 40 or Tartrazine) which require mandatory hyperactivity warning labels in the European Union, while the other variant uses natural plant extracts (paprika, beet, or turmeric).',
      severity: 4
    },
    {
      id: 'synthetic_preservatives',
      title: 'Preservatives: Synthetic (TBHQ / BHA / BHT) vs Natural Antioxidants',
      terms: ['tbhq', 'tertiary butylhydroquinone', 'e319', 'ins 319', 'bha', 'butylated hydroxyanisole', 'e320', 'ins 320', 'bht', 'butylated hydroxytoluene', 'e321', 'ins 321', 'sodium benzoate', 'e211', 'ins 211', 'potassium sorbate', 'e202', 'ins 202'],
      descriptionWithBad: 'uses synthetic chemical antioxidants (TBHQ/BHA/BHT) to extend shelf life, whereas the other formulation relies on natural tocopherols (Vitamin E) or clean preservation.',
      severity: 3
    },
    {
      id: 'hydrogenated_fats',
      title: 'Lipid Hydrogenation: Trans Fats / Hydrogenated Oils',
      terms: ['partially hydrogenated', 'hydrogenated vegetable oil', 'shortening', 'vanaspati', 'hydrogenated palm', 'hydrogenated fat', 'trans fat'],
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
      terms: ['aspartame', 'sucralose', 'acesulfame', 'ace-k', 'saccharin', 'e950', 'e951', 'e954', 'e955', 'ins 950', 'ins 951', 'ins 954', 'ins 955', 'neotame', 'e961'],
      descriptionWithBad: 'uses high-intensity non-nutritive synthetic sweeteners (Aspartame / Sucralose / Acesulfame-K) which per WHO guidelines should not be used as a means of achieving weight control.',
      severity: 3
    }
  ], []);

  // Compute nutritionally consistent scores across all major formulation differences
  const { effectiveLocalScore, effectiveIntlScore, disparities } = useMemo(() => {
    if (localHealthScore == null) return { effectiveLocalScore: null, effectiveIntlScore: internationalData?.healthScore ?? null, disparities: [] };
    let local = Number(localHealthScore);
    let intl = internationalData?.healthScore != null ? Number(internationalData.healthScore) : null;
    const detectedDisparities = [];

    if (intl != null) {
      const localTexts = extractAllTexts(scannedIngredients, localWhoFlags);
      const intlTexts = extractAllTexts(internationalData.ingredientsFound, internationalData.whoFlags);
      if (internationalData.ingredientsText) {
        intlTexts.push(String(internationalData.ingredientsText).toLowerCase());
      }

      let localPenalty = 0;
      let intlPenalty = 0;

      FORMULATION_FACTORS.forEach(factor => {
        const localHas = hasAnyTerm(localTexts, factor.terms);
        const intlHas = hasAnyTerm(intlTexts, factor.terms);

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
        // Local has inferior formulation (e.g. Palm Oil in India vs Sunflower/Canola in Global)
        const netPenalty = Math.max(6, (localPenalty - intlPenalty) * 3);
        if (local >= intl) {
          local = Math.max(0, intl - netPenalty);
        } else if (intl - local < netPenalty) {
          local = Math.max(0, intl - netPenalty);
        }
      } else if (intlPenalty > localPenalty) {
        // Global has inferior formulation (e.g. HFCS in US vs Cane Sugar in India)
        const netPenalty = Math.max(6, (intlPenalty - localPenalty) * 3);
        if (intl >= local) {
          intl = Math.max(0, local - netPenalty);
        } else if (local - intl < netPenalty) {
          intl = Math.max(0, local - netPenalty);
        }
      } else if (localPenalty > 0 && intlPenalty > 0) {
        // Equal cumulative penalties across different synthetic factors
        const floor = Math.min(local, intl);
        local = floor;
        intl = floor;
      }
    }

    return { effectiveLocalScore: local, effectiveIntlScore: intl, disparities: detectedDisparities };
  }, [localHealthScore, internationalData, scannedIngredients, localWhoFlags, FORMULATION_FACTORS]);

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
            useFastModel: 'true',
            language: language || 'English'
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
                useFastModel: 'true',
                language: language || 'English'
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
  }, [token, productName, globalEquivalent, language]);

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

  const renderIngredientList = (items, emptyMessage, isGlobal = false) => {
    if (!Array.isArray(items) || items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-10">
          <span className="text-3xl mb-2">{isGlobal ? '🌍' : '🌿'}</span>
          <p className="italic text-xs text-gray-500 max-w-[200px] leading-relaxed">
            {emptyMessage}
          </p>
        </div>
      );
    }

    return (
      <ul className="space-y-2.5 text-gray-800">
        {items.filter(i => i != null).map((ing, idx) => {
          const text = String((typeof ing === 'string' ? ing : ing?.name) || '');
          const status = typeof ing === 'string' ? null : ing?.status;
          const match = text ? (text.match(/(.+)[\s_]+\(?(\d+(?:\.\d+)?\s*(?:%|g|mg|ml|mcg|kcal|l))\)?/i)) : null;

          const dailyLimit = typeof ing === 'object' ? ing?.dailyLimit : null;
          const productAmount = typeof ing === 'object' ? ing?.productAmount : null;
          const explanation = typeof ing === 'object' ? ing?.explanation : null;

          return (
            <li key={idx} className="capitalize flex flex-col border-b border-gray-100 last:border-0 pb-2.5 mb-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-xs text-gray-800 truncate" title={text}>
                    {match ? match[1].trim() : text}
                  </span>
                  {status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${getIngredientStatusColor(status)}`}>
                      {String(status)}
                    </span>
                  )}
                </div>
                {match && (
                  <span className="bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded-md font-bold shrink-0 border border-gray-200">
                    {match[2]}
                  </span>
                )}
              </div>
              {(dailyLimit || productAmount || explanation) && (
                <div className="mt-1 text-[11px] text-gray-500 normal-case space-y-0.5 pl-0.5">
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
    );
  };

  // Authenticated View
  return (
    <div className="mt-8 bg-emerald-50/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-200 overflow-hidden">
      <div className="p-6 sm:p-8 border-b border-emerald-200 bg-gradient-to-r from-emerald-100/80 to-emerald-50/80">
        <h3 className="text-2xl font-extrabold text-gray-900">{t('intl_variant_comp')}</h3>
        <p className="text-sm text-gray-600 mt-2 font-medium">{t('intl_variant_comp_desc')}</p>
        
        {effectiveLocalScore != null && effectiveIntlScore != null && (
          <div className="mt-4 p-3 rounded-xl bg-white/95 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-sm">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <span className="text-base shrink-0">⚖️</span>
              <span className="font-bold text-gray-800 whitespace-nowrap">Formulation Impact:</span>
            </div>
            <div className="min-w-0 flex items-center justify-start sm:justify-end">
              {(() => {
                const diff = effectiveIntlScore - effectiveLocalScore;
                const isBothRedOrPurple = effectiveLocalScore < 55 && effectiveIntlScore < 55;
                const isBothYellow = effectiveLocalScore >= 55 && effectiveLocalScore < 80 && effectiveIntlScore >= 55 && effectiveIntlScore < 80;
                const isBothGreen = effectiveLocalScore >= 80 && effectiveIntlScore >= 80;
                const isPurple = effectiveLocalScore < 30 || effectiveIntlScore < 30;

                if (effectiveLocalScore === effectiveIntlScore) {
                  return (
                    <span className="inline-flex items-center text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 leading-snug whitespace-nowrap text-center">
                      {isBothRedOrPurple
                        ? `Equalized Tier (${effectiveLocalScore}/100)`
                        : `Identical Formulation (${effectiveLocalScore}/100)`}
                    </span>
                  );
                }

                // When both products fall into the same risk tier and are within statistical tolerance (<= 8 pts) with NO specific formulation disparities:
                if (disparities.length === 0 && Math.abs(diff) <= 8 && (isBothRedOrPurple || isBothYellow || isBothGreen)) {
                  return (
                    <span className="inline-flex items-center text-amber-800 font-extrabold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 leading-snug whitespace-nowrap text-center">
                      {isPurple
                        ? `High Risk Profile (${effectiveLocalScore} vs ${effectiveIntlScore})`
                        : isBothRedOrPurple 
                        ? `Both Ultra-Processed (${effectiveLocalScore} vs ${effectiveIntlScore})`
                        : `Similar Profile (${effectiveLocalScore} vs ${effectiveIntlScore})`}
                    </span>
                  );
                }

                if (diff > 0) {
                  return (
                    <span className="inline-flex items-center text-emerald-700 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 leading-snug whitespace-nowrap">
                      Global +{diff} pts ({effectiveIntlScore} vs {effectiveLocalScore})
                    </span>
                  );
                } else {
                  return (
                    <span className="inline-flex items-center text-blue-700 font-extrabold bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 leading-snug whitespace-nowrap">
                      Local +{Math.abs(diff)} pts ({effectiveLocalScore} vs {effectiveIntlScore})
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Column 1: Scanned Ingredients */}
              <div className="flex flex-col bg-white border border-gray-200/90 rounded-2xl p-4 sm:p-5 shadow-sm transition-all">
                {/* Aligned Header */}
                <div className="flex items-start justify-between gap-3 mb-4 min-h-[4.75rem]">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="bg-emerald-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-gray-900 text-sm sm:text-base leading-tight">
                          {t('your_scanned_product')}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider shrink-0">
                          {t('local_scan_badge') || 'Local Scan'}
                        </span>
                      </div>
                      {productName && (
                        <p className="text-xs text-gray-600 font-medium line-clamp-2 mt-1 leading-snug" title={productName}>
                          {productName}
                        </p>
                      )}
                    </div>
                  </div>
                  {effectiveLocalScore != null && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-tight border shrink-0 mt-0.5 shadow-xs ${
                      effectiveLocalScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      effectiveLocalScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                      effectiveLocalScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                      'bg-purple-50 text-purple-700 border border-purple-200 font-bold'
                    }`}>
                      {effectiveLocalScore}/100
                    </span>
                  )}
                </div>

                {/* Symmetrical Ingredients Box - Pure Clean White */}
                <div className="flex-1 h-72 overflow-y-auto bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  {renderIngredientList(scannedIngredients, t('no_ingredients'), false)}
                </div>
              </div>

              {/* Column 2: International Data */}
              <div className="flex flex-col bg-white border border-gray-200/90 rounded-2xl p-4 sm:p-5 shadow-sm transition-all">
                {/* Aligned Header */}
                <div className="flex items-start justify-between gap-3 mb-4 min-h-[4.75rem]">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-extrabold text-gray-900 text-sm sm:text-base leading-tight">
                          {t('global_version')}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 border ${
                          isSameProduct
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {isSameProduct
                            ? (t('exact_product_badge') || 'Exact Match')
                            : (t('similar_product_badge') || 'Similar Benchmark')}
                        </span>
                      </div>
                      {intlDisplayName && (
                        <p className="text-xs text-gray-600 font-medium line-clamp-2 mt-1 leading-snug" title={intlDisplayName}>
                          {intlDisplayName}
                        </p>
                      )}
                    </div>
                  </div>
                  {effectiveIntlScore != null && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-tight border shrink-0 mt-0.5 shadow-xs ${
                      effectiveIntlScore >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      effectiveIntlScore >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                      effectiveIntlScore >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                      'bg-purple-50 text-purple-700 border border-purple-200 font-bold'
                    }`}>
                      {effectiveIntlScore}/100
                    </span>
                  )}
                </div>

                {/* Symmetrical Ingredients Box - Pure Clean White */}
                <div className="flex-1 h-72 overflow-y-auto bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  {renderIngredientList(
                    internationalData?.ingredientsFound,
                    productName ? t('not_in_db') : t('scan_to_fetch'),
                    true
                  )}
                </div>
              </div>
            </div>

            {/* Similar Product Notice Banner when product is not sold outside the country */}
            {!isSameProduct && internationalData && (
              <div className="mt-5 p-4 rounded-xl bg-amber-50/95 border border-amber-200/90 text-amber-900 flex items-start gap-3 shadow-sm transition-all">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 text-base font-bold shadow-xs">
                  ℹ️
                </div>
                <div className="text-xs leading-relaxed flex-1 min-w-0">
                  <div className="font-extrabold text-sm text-amber-950 mb-1 flex items-center gap-2 flex-wrap">
                    <span>{t('similar_product_notice_title') || 'Similar Product Benchmark (Not the Same Product)'}</span>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 border border-amber-300 shrink-0">
                      {t('category_benchmark') || 'Category Benchmark'}
                    </span>
                  </div>
                  <p className="text-amber-900 font-medium">
                    The exact product <strong>"{productName}"</strong> is not sold outside the country or listed in the global international database. This is a similar product from the same category (<strong>"{intlDisplayName}"</strong>), <em>not the exact same product</em>, used as an international benchmark to highlight ingredient and formulation differences.
                  </p>
                </div>
              </div>
            )}

          {/* Intelligent Formulation & Variant Disparity Insights */}
          {internationalData && (
            <div className="mt-6 space-y-4">
              {/* Variant Disparity Inspector Warning */}
              {(() => {
                const localNames = (Array.isArray(scannedIngredients) ? scannedIngredients : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase());
                const intlNames = [
                  ...(Array.isArray(internationalData.ingredientsFound) ? internationalData.ingredientsFound : []).map(i => String((typeof i === 'string' ? i : i?.name) || '').toLowerCase()),
                  ...(internationalData.ingredientsText ? [String(internationalData.ingredientsText).toLowerCase()] : [])
                ];

                const sugarTerms = ['sugar', 'sucrose', 'glucose', 'fructose', 'cane sugar', 'corn syrup', 'dextrose', 'invert sugar', 'sucre'];
                const nssTerms = ['aspartame', 'sucralose', 'acesulfame', 'ace-k', 'stevia', 'saccharin', 'erythritol', 'cyclamate', 'monk fruit'];

                const localHasSugar = hasAnyTerm(localNames, sugarTerms);
                const localHasNSS = hasAnyTerm(localNames, nssTerms);
                const intlHasSugar = hasAnyTerm(intlNames, sugarTerms);
                const intlHasNSS = hasAnyTerm(intlNames, nssTerms);

                const isSugarVsDiet = (localHasSugar && !localHasNSS && intlHasNSS && !intlHasSugar) || (!localHasSugar && localHasNSS && !intlHasNSS && intlHasSugar);

                const bakedTerms = ['baked', 'air popped', 'air-popped', 'oven baked'];
                const localBaked = hasAnyTerm(localNames, bakedTerms) || (productName && bakedTerms.some(t => matchesTerm(productName, t)));
                const intlBaked = hasAnyTerm(intlNames, bakedTerms) || (internationalData.productName && bakedTerms.some(t => matchesTerm(internationalData.productName, t)));
                const isBakedMismatch = localBaked !== intlBaked;

                const decafTerms = ['decaf', 'decaffeinated', 'caffeine-free', 'caffeine free', 'sans cafeine'];
                const localDecaf = hasAnyTerm(localNames, decafTerms) || (productName && decafTerms.some(t => matchesTerm(productName, t)));
                const intlDecaf = hasAnyTerm(intlNames, decafTerms) || (internationalData.productName && decafTerms.some(t => matchesTerm(internationalData.productName, t)));
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
