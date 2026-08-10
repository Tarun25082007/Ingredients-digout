import React, { useState, useRef, useEffect } from 'react';
import api from '../api';
import HealthStatusCard from './HealthStatusCard';

const ScannerModal = ({ onClose }) => {
  const [mode, setMode] = useState('select'); // 'select', 'camera', 'uploading', 'result'
  const [error, setError] = useState('');
  const [assessment, setAssessment] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Stop camera stream when component unmounts or mode changes
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

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
    formData.append('image', file);

    try {
      const response = await api.post('/scan/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAssessment(response.data);
      setMode('result');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to analyze image. Please try again.');
      setMode('select');
    }
  };

  const resetScanner = () => {
    setAssessment(null);
    setMode('select');
    setError('');
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
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <button 
                  onClick={startCamera}
                  className="w-full sm:w-auto px-8 py-4 bg-primary-dark hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg transition transform hover:-translate-y-1 flex items-center justify-center space-x-2"
                >
                  <span>📷 Take Photo</span>
                </button>
                
                <div className="relative w-full sm:w-auto">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold shadow-sm transition flex items-center justify-center space-x-2">
                    <span>📁 Upload File</span>
                  </div>
                </div>
              </div>
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
