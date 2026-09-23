import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import HealthStatusCard from './HealthStatusCard';
import VariantComparison from './VariantComparison';
import { Upload, Camera, X, Barcode } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { getUserCountry, getAllCountries } from '../utils/countryUtils';

const ScannerModal = ({ onClose, onScanComplete }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState('category_select'); // 'category_select', 'select', 'camera', 'barcode', 'uploading', 'result'
  const [foodCategory, setFoodCategory] = useState(null); // 'fresh' or 'packaged'
  const [error, setError] = useState('');
  const [searchName, setSearchName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [promptCountry, setPromptCountry] = useState(getUserCountry().toUpperCase());
  const [scanRegion, setScanRegion] = useState(getUserCountry());
  const countries = getAllCountries();
  
  const [assessment, setAssessment] = useState(null);
  const [hasCamera, setHasCamera] = useState(true);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Stop camera stream when component unmounts or mode changes
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    // Check if camera is available
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const cameras = devices.filter(device => device.kind === 'videoinput');
          setHasCamera(cameras.length > 0);
        })
        .catch(() => setHasCamera(false));
    } else {
      setHasCamera(false);
    }

    return () => {
      stopCamera();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Debounce autocomplete search
  useEffect(() => {
    let isActive = true;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (searchName.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await api.get(`/scan/autocomplete?query=${encodeURIComponent(searchName.trim())}&countryCode=${encodeURIComponent(promptCountry)}`);
        // Ensure response is an array of strings
        if (isActive && Array.isArray(response.data)) {
          setSuggestions(response.data || []);
          setShowSuggestions(true);
        }
      } catch (err) {
        if (isActive) console.error('Autocomplete failed:', err);
      } finally {
        if (isActive) setIsTyping(false);
      }
    }, 300);
    
    return () => {
      isActive = false;
    };
  }, [searchName]);

  const startCamera = async () => {
    setError('');
    setMode('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Prefer back camera on mobile
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      stopCamera();
      setError('Camera access denied or unavailable. Please upload a file instead.');
      setMode('select');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File is too large. Please select an image under 5MB.');
        e.target.value = ''; // Reset input
        return;
      }
      uploadImage(file);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Stop camera AFTER drawing to canvas to avoid blank frame on some browsers
      canvas.toBlob((blob) => {
        stopCamera();
        if (blob) {
          const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
          uploadImage(file);
        }
      }, 'image/jpeg', 0.92);
    }
  };

  const uploadImage = async (file) => {
    setMode('uploading');
    setError('');
    
    const formData = new FormData();
    formData.append('file', file); // Backend expects @RequestParam("file")
    if (foodCategory) formData.append('foodCategory', foodCategory);
    
    // Pass user's preferred language from local storage
    const userLang = localStorage.getItem('userLanguage') || 'English';
    formData.append('language', userLang);
    formData.append('countryCode', getUserCountry());

    try {
      const response = await api.post('/scan/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAssessment(response.data);
      setMode('result');
      if (onScanComplete) {
        onScanComplete(response.data);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      setError(serverMsg ? `Server Error: ${serverMsg}` : err.message || 'Failed to analyze image. Please try again.');
      setMode('select');
    }
  };

  const searchByProductName = async (e, customName = null, customCountry = null, forceAi = false) => {
    if (e) e.preventDefault();
    const query = customName !== null ? customName : searchName;
    if (!query.trim()) return;
    
    // Sanitize: allow letters in all languages (Unicode), numbers, spaces, and safe food name punctuation (-, ', ., &, /)
    const sanitizedSearch = query.replace(/[^\p{L}\p{N}\s\-'.&/]/gu, '').replace(/\s+/g, ' ').trim();
    
    setMode('uploading');
    setError('');
    
    try {
      const activeCountryCode = customCountry !== null ? customCountry : getUserCountry();
      setScanRegion(activeCountryCode);
      const userLang = localStorage.getItem('userLanguage') || 'English';
      const response = await api.post('/scan/analyze-name', { 
        productName: sanitizedSearch,
        countryCode: activeCountryCode,
        forceAi: forceAi,
        foodCategory: foodCategory,
        language: userLang
      });
      setAssessment(response.data);
      setMode('result');
      if (onScanComplete) {
        onScanComplete(response.data);
      }
    } catch (err) {
      if (err.response?.data?.error === 'REGION_NOT_FOUND') {
        setMode('country_prompt');
        return;
      }
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      setError(serverMsg ? `Server Error: ${serverMsg}` : err.message || 'Failed to analyze product. Please try again.');
      setMode('select');
    }
  };

  const resetScanner = () => {
    stopCamera();
    setAssessment(null);
    setMode('category_select');
    setFoodCategory(null);
    setError('');
    setSearchName('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleBarcodeResult = async (barcode) => {
    setMode('uploading');
    setError('');
    try {
      const userCountry = getUserCountry();
      const countryPrefix = (userCountry && userCountry.toLowerCase() !== 'world') ? userCountry.toLowerCase() : 'world';

      let data = null;
      try {
        const regionalRes = await fetch(`https://${countryPrefix}.openfoodfacts.org/api/v0/product/${barcode}.json`);
        data = await regionalRes.json();
      } catch (regionalErr) {
        // Continue to world fallback
      }

      if ((!data || data.status !== 1) && countryPrefix !== 'world') {
        try {
          const worldRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
          data = await worldRes.json();
        } catch (worldErr) {
          // Handled below
        }
      }
      
      if (data && data.status === 1 && data.product && data.product.product_name) {
        setSearchName(data.product.product_name);
        
        // Use our backend API to analyze the name
        const userLang = localStorage.getItem('userLanguage') || 'English';
        const analyzeResponse = await api.post('/scan/analyze-name', { 
          productName: data.product.product_name,
          language: userLang,
          countryCode: getUserCountry(),
          foodCategory: foodCategory || 'packaged'
        });
        setAssessment(analyzeResponse.data);
        setMode('result');
        if (onScanComplete) {
          onScanComplete(analyzeResponse.data);
        }
      } else {
        setError(`Barcode ${barcode} found, but product name is not in the database. Please type the name or upload an image.`);
        setMode('select');
      }
    } catch (err) {
      setError('Failed to look up barcode. Please try again.');
      setMode('select');
    }
  };

  const handleSuggestionClick = (suggestionName, forceAi = false) => {
    setSearchName(suggestionName);
    setShowSuggestions(false);
    searchByProductName(null, suggestionName, null, forceAi);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white text-gray-900 rounded-t-[2rem] sm:rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative animate-slideUp sm:animate-fadeIn">
        
        {/* Close Button */}
        <button 
          onClick={() => { stopCamera(); onClose(); }}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition z-10"
        >
          ✕
        </button>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Mode: Category Selection */}
          {mode === 'category_select' && (
            <div className="text-center py-12 animate-fadeIn">
              <h2 className="text-3xl font-extrabold text-gray-800 mb-4">{t('What are you analyzing?')}</h2>
              <p className="text-gray-600 mb-10 max-w-md mx-auto">
                {t('Select the type of food to get the most accurate health assessment.')}
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-6">
                <button 
                  onClick={() => { setFoodCategory('fresh'); setMode('select'); }}
                  className="flex-1 group flex flex-col items-center justify-center p-8 border border-gray-200 rounded-2xl hover:border-emerald-500 hover:shadow-lg transition-all duration-300 bg-emerald-50/30 active:scale-95"
                >
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥗</div>
                  <span className="font-bold text-gray-800 text-lg">{t('fresh_food')}</span>
                  <span className="text-sm text-gray-500 mt-2">{t('Dosa, Idli, Fruits, Homemade')}</span>
                </button>

                <button 
                  onClick={() => { setFoodCategory('packaged'); setMode('select'); }}
                  className="flex-1 group flex flex-col items-center justify-center p-8 border border-gray-200 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all duration-300 bg-blue-50/30 active:scale-95"
                >
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">🥫</div>
                  <span className="font-bold text-gray-800 text-lg">{t('packaged_food')}</span>
                  <span className="text-sm text-gray-500 mt-2">{t('Items with a barcode & label')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode: Selection */}
          {mode === 'select' && (
            <div className="text-center py-12 animate-fadeIn">
              <button 
                onClick={() => setMode('category_select')}
                className="absolute top-4 left-4 text-sm text-gray-500 hover:text-gray-800 flex items-center"
              >
                ← Back
              </button>
              <h2 className="text-3xl font-extrabold text-gray-800 mb-4">
                {foodCategory === 'fresh' ? t('Analyze Fresh Food') : t('Scan Ingredients')}
              </h2>
              <p className="text-gray-600 mb-10 max-w-md mx-auto">
                {foodCategory === 'fresh' 
                  ? t('Take a photo of your food or search by name to evaluate it.') 
                  : t('Take a clear photo of an ingredient list, scan a barcode, or search by name.')}
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4">
                {foodCategory === 'packaged' && (
                  <button 
                    onClick={() => setMode('barcode')}
                    className="flex-1 group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-300"
                  >
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Barcode className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700">{t('scan_barcode')}</span>
                    <span className="text-xs text-gray-400 mt-1">{t('Fast & accurate')}</span>
                  </button>
                )}

                <div className="flex-1 relative">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full h-full group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-300">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700">{t('upload_image')}</span>
                    <span className="text-xs text-gray-400 mt-1">{t('Ingredients list')}</span>
                  </div>
                </div>

                {hasCamera && (
                  <button 
                    onClick={startCamera}
                    className="flex-1 group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-300"
                  >
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="font-medium text-gray-700">{t('take_photo')}</span>
                    <span className="text-xs text-gray-400 mt-1">{t('Ingredients list')}</span>
                  </button>
                )}
              </div>

              <div className="mt-10 flex items-center justify-center">
                <div className="w-full max-w-md">
                  <div className="flex items-center space-x-4 mb-4">
                    <hr className="flex-1 border-gray-300" />
                    <span className="text-gray-400 font-medium">{t('search_by_name')}</span>
                    <hr className="flex-1 border-gray-300" />
                  </div>
                  <form onSubmit={searchByProductName} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder={t('search_placeholder')}
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        onFocus={() => { if (searchName.trim().length >= 2) setShowSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-dark shadow-sm"
                      />
                      {/* Autocomplete Dropdown */}
                      {showSuggestions && searchName.trim().length >= 2 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                          {isTyping && suggestions.length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500">{t('loading_suggestions')}</div>
                          ) : (
                            <>
                              {suggestions.map((item, idx) => (
                                <div 
                                  key={idx} 
                                  onMouseDown={() => handleSuggestionClick(item.productName)}
                                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                >
                                  {item.imageUrl ? (
                                    <img src={item.imageUrl} alt={item.productName} className="w-10 h-10 object-contain rounded bg-white border border-gray-100" />
                                  ) : (
                                    <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded text-gray-400">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    </div>
                                  )}
                                  <span className="font-medium text-gray-800 text-sm truncate">{item.productName}</span>
                                </div>
                              ))}
                              {/* Always show the AI fallback option */}
                              <div 
                                onMouseDown={() => handleSuggestionClick(searchName, true)}
                                className="flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer border-t border-gray-200 bg-gray-50"
                              >
                                <div className="w-10 h-10 flex items-center justify-center bg-indigo-100 rounded text-indigo-600">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                                </div>
                                <span className="font-medium text-indigo-700 text-sm truncate">
                                  ✨ {t('search_ai_btn')} <strong>"{searchName}"</strong>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <button 
                      type="submit"
                      disabled={!searchName.trim()}
                      className="px-6 py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-bold shadow-sm transition disabled:opacity-50"
                    >
                      {t('search_btn')}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Mode: Barcode Scanner */}
          {mode === 'barcode' && (
            <div className="py-6">
              <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Scan Barcode</h2>
              <BarcodeScanner 
                onResult={handleBarcodeResult} 
                onError={(errMsg) => {
                  setError(errMsg);
                  setMode('select');
                }}
                onClose={resetScanner} 
              />
            </div>
          )}

          {/* Mode: Camera */}
          {mode === 'camera' && (
            <div className="flex flex-col items-center py-4">
              <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Take a Photo</h2>
              <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-xl bg-black aspect-[3/4]">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                ></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                
                {/* Camera Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col">
                  <div className="flex-1 bg-black/40"></div>
                  <div className="h-64 flex">
                    <div className="flex-1 bg-black/40"></div>
                    <div className="w-full max-w-sm relative">
                      {/* Brackets */}
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                    </div>
                    <div className="flex-1 bg-black/40"></div>
                  </div>
                  <div className="flex-1 bg-black/40"></div>
                </div>
              </div>
              
              <div className="mt-8 flex gap-4 w-full max-w-md">
                <button 
                  onClick={resetScanner}
                  className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl transition active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={takePhoto}
                  className="flex-[2] py-4 bg-primary-dark hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" /> Snap Photo
                </button>
              </div>
            </div>
          )}

          {/* Mode: Uploading / Loading */}
          {mode === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-gray-200 border-t-primary-dark rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-gray-800">Analyzing Ingredients...</h3>
              <p className="text-gray-500 mt-2">Checking WHO guidelines and flagging additives.</p>
            </div>
          )}

          {/* Mode: Country Prompt (Region Not Found) */}
          {mode === 'country_prompt' && (
            <div className="text-center py-12 px-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-4">Product Not Found in Your Region</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                We couldn't find <strong>"{searchName}"</strong> in the database for your current country. Where is this product from?
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto">
                <div className="relative w-full sm:w-auto flex-1">
                  <select 
                    value={promptCountry.toLowerCase()} 
                    onChange={(e) => setPromptCountry(e.target.value.toUpperCase())}
                    className="w-full appearance-none bg-white border border-gray-300 text-gray-700 py-3 pl-4 pr-10 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-primary-light transition shadow-sm"
                  >
                    <option value="world">🌍 Global (World)</option>
                    {countries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
                
                <button 
                  onClick={() => searchByProductName(null, searchName, promptCountry.toLowerCase())}
                  className="w-full sm:w-auto px-6 py-3 bg-primary-dark hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition"
                >
                  Search Again
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-4">
                <button 
                  onClick={() => searchByProductName(null, searchName, 'world')}
                  className="text-gray-600 hover:text-primary-dark font-medium underline"
                >
                  Just search Global database
                </button>
                <span className="text-gray-300">|</span>
                <button 
                  onClick={() => searchByProductName(null, searchName, promptCountry.toLowerCase(), true)}
                  className="text-indigo-600 hover:text-indigo-800 font-medium underline flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                  Analyze with AI instead
                </button>
                <span className="text-gray-300">|</span>
                <button 
                  onClick={resetScanner}
                  className="text-gray-500 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Mode: Result */}
          {mode === 'result' && assessment && (
            <div className="animate-fadeIn">
              {assessment.dataSourceRegion === 'usda_database' || assessment.dataSourceRegion === 'usda_foundation' ? (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm text-center uppercase tracking-wide">
                  🏛️ Sourced from <strong>USDA FoodData Central (Branded)</strong> database
                </div>
              ) : assessment.dataSourceRegion === 'world_fallback' ? (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm text-center">
                  ⚠️ <strong>Not available in your region.</strong> Sourced from <strong>Global OpenFoodFacts Database</strong>.
                </div>
              ) : assessment.dataSourceRegion === 'world' ? (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm text-center uppercase tracking-wide">
                  🌍 Sourced from <strong>Global (World)</strong> database
                </div>
              ) : assessment.dataSourceRegion ? (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm text-center uppercase tracking-wide">
                  📍 Sourced from <strong>{assessment.dataSourceRegion.toUpperCase()}</strong> database
                </div>
              ) : (
                <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg text-sm text-center">
                  ✨ Analyzed using <strong>AI Fallback Engine</strong>
                </div>
              )}
              <HealthStatusCard assessment={assessment} />
              
              {scanRegion !== 'world' && (
                <VariantComparison 
                  scannedIngredients={assessment.ingredientsFound} 
                  productName={assessment.productName}
                  globalEquivalent={assessment.globalEquivalent}
                  localHealthScore={assessment.healthScore}
                />
              )}
              
              <div className="mt-8 text-center">
                <button 
                  onClick={resetScanner}
                  className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg transition shadow-sm"
                >
                  {t('scan_another')}
                </button>
                <p className="text-[11px] text-gray-400 mt-4">
                  ℹ️ AI-powered analysis. AI can make mistakes — always verify with product packaging or a healthcare provider.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScannerModal;
