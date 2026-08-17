import React, { useState, useRef, useEffect } from 'react';
import api from '../api';
import HealthStatusCard from './HealthStatusCard';
import { Upload, Camera, X, Barcode } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';

const ScannerModal = ({ onClose, onScanComplete }) => {
  const [mode, setMode] = useState('select'); // 'select', 'camera', 'barcode', 'uploading', 'result'
  const [error, setError] = useState('');
  const [searchName, setSearchName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
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
        const response = await api.get(`/scan/autocomplete?query=${encodeURIComponent(searchName.trim())}`);
        setSuggestions(response.data || []);
        setShowSuggestions(true);
      } catch (err) {
        console.error('Autocomplete failed:', err);
      } finally {
        setIsTyping(false);
      }
    }, 300);
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
      setError('Camera access denied or unavailable. Please upload a file instead.');
      setMode('select');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
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
      
      stopCamera();
      
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
          uploadImage(file);
        }
      }, 'image/jpeg');
    }
  };

  const uploadImage = async (file) => {
    setMode('uploading');
    setError('');
    
    const formData = new FormData();
    formData.append('file', file); // Backend expects @RequestParam("file")

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

  const searchByProductName = async (e) => {
    e.preventDefault();
    if (!searchName.trim()) return;
    
    setMode('uploading');
    setError('');
    
    try {
      const response = await api.post('/scan/analyze-name', { productName: searchName.trim() });
      setAssessment(response.data);
      setMode('result');
      if (onScanComplete) {
        onScanComplete(response.data);
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      setError(serverMsg ? `Server Error: ${serverMsg}` : err.message || 'Failed to analyze product. Please try again.');
      setMode('select');
    }
  };

  const resetScanner = () => {
    setAssessment(null);
    setMode('select');
    setError('');
    setSearchName('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleBarcodeResult = async (barcode) => {
    setMode('uploading');
    setError('');
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const data = await response.json();
      
      if (data.status === 1 && data.product && data.product.product_name) {
        setSearchName(data.product.product_name);
        
        // Use our backend API to analyze the name
        const analyzeResponse = await api.post('/scan/analyze-name', { productName: data.product.product_name });
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

  const handleSuggestionClick = (suggestionName) => {
    setSearchName(suggestionName);
    setShowSuggestions(false);
    // Automatically trigger search
    setTimeout(() => {
      searchByProductName({ preventDefault: () => {} });
    }, 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative">
        
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

          {/* Mode: Selection */}
          {mode === 'select' && (
            <div className="text-center py-12">
              <h2 className="text-3xl font-extrabold text-gray-800 mb-4">Scan Ingredients</h2>
              <p className="text-gray-600 mb-10 max-w-md mx-auto">
                Take a clear photo of an ingredient list or upload an image to evaluate it against WHO guidelines.
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4">
                <button 
                  onClick={() => setMode('barcode')}
                  className="flex-1 group flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all duration-300"
                >
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Barcode className="w-6 h-6" />
                  </div>
                  <span className="font-medium text-gray-700">Scan Barcode</span>
                  <span className="text-xs text-gray-400 mt-1">Fast & accurate</span>
                </button>

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
                    <span className="font-medium text-gray-700">Upload Image</span>
                    <span className="text-xs text-gray-400 mt-1">Ingredients list</span>
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
                    <span className="font-medium text-gray-700">Take Photo</span>
                    <span className="text-xs text-gray-400 mt-1">Ingredients list</span>
                  </button>
                )}
              </div>

              <div className="mt-10 flex items-center justify-center">
                <div className="w-full max-w-md">
                  <div className="flex items-center space-x-4 mb-4">
                    <hr className="flex-1 border-gray-300" />
                    <span className="text-gray-400 font-medium">OR SEARCH BY NAME</span>
                    <hr className="flex-1 border-gray-300" />
                  </div>
                  <form onSubmit={searchByProductName} className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="e.g. Campa Orange, Lay's Classic"
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-dark shadow-sm"
                      />
                      {/* Autocomplete Dropdown */}
                      {showSuggestions && (suggestions.length > 0 || isTyping) && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                          {isTyping && suggestions.length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500">Loading suggestions...</div>
                          ) : (
                            <>
                              {suggestions.map((item, idx) => (
                                <div 
                                  key={idx} 
                                  onClick={() => handleSuggestionClick(item.productName)}
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
                                onClick={() => handleSuggestionClick(searchName)}
                                className="flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer border-t border-gray-200 bg-gray-50"
                              >
                                <div className="w-10 h-10 flex items-center justify-center bg-indigo-100 rounded text-indigo-600">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                                </div>
                                <span className="font-medium text-indigo-700 text-sm truncate">
                                  ✨ Search for <strong>"{searchName}"</strong> using AI
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
                      Search
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
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-md rounded-xl overflow-hidden shadow-inner bg-black">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="w-full h-auto object-cover"
                ></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
              </div>
              
              <div className="mt-8 flex gap-4">
                <button 
                  onClick={resetScanner}
                  className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={takePhoto}
                  className="px-8 py-3 bg-primary-light hover:bg-primary-dark text-white font-bold rounded-lg shadow-md transition"
                >
                  Snap Photo
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

          {/* Mode: Result */}
          {mode === 'result' && assessment && (
            <div className="animate-fadeIn">
              <HealthStatusCard assessment={assessment} />
              
              <div className="mt-8 text-center">
                <button 
                  onClick={resetScanner}
                  className="px-8 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg transition shadow-sm"
                >
                  Scan Another Product
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScannerModal;
