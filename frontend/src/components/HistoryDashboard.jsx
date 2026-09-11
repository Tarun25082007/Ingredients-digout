import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import HealthStatusCard from './HealthStatusCard';

const HistoryDashboard = () => {
  const { token, isGuest, logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedScan, setSelectedScan] = useState(null);

  useEffect(() => {
    if (!token || isGuest) {
      navigate('/login');
      return;
    }

    const fetchHistory = async () => {
      try {
        const response = await api.get('/scan/history');
        setHistory(response.data);
        setError(''); // clear any previous errors
      } catch (err) {
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          // Token is likely expired or invalid
          logout();
          navigate('/login');
          return;
        }
        
        // In dev mode, StrictMode double-fetches might hit the 1req/10s rate limit.
        // We only show the error if we haven't already successfully loaded the data.
        setHistory(prev => {
          if (prev.length === 0) {
            setError('Failed to load scan history. Please try again later.');
          }
          return prev;
        });
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [token, isGuest, navigate]);

  const deleteScan = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this scan?")) return;
    
    try {
      await api.delete(`/scan/history/${id}`);
      setHistory(prev => prev.filter(scan => scan.id !== id));
    } catch (err) {
      setError('Failed to delete scan.');
    }
  };

  if (loading) {
    return (
      <div className="relative flex justify-center items-center min-h-[90vh]">
        <div 
          className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
        >
          <div className="absolute inset-0 bg-custom-900/85 backdrop-blur-[2px]"></div>
        </div>
        <div className="relative z-10 w-12 h-12 border-4 border-custom-700 border-t-custom-300 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[90vh] py-10 px-6">
      {/* Edge-to-edge ambient background matching the home page */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
      >
        <div className="absolute inset-0 bg-custom-900/85 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-md">{t('scan_history')}</h2>
          <p className="text-custom-300 text-sm font-medium mt-1">Review your previously evaluated food products and health assessments</p>
        </div>
        
        {error && (
          <div className="bg-red-950/80 text-red-200 p-4 rounded-xl mb-6 border border-red-500/40 backdrop-blur-md font-medium">
            ⚠️ {error}
          </div>
        )}

        {history.length === 0 && !error ? (
          <div className="text-center py-20 bg-custom-900/60 backdrop-blur-md rounded-3xl shadow-xl border border-custom-700/60">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-white mb-2">{t('no_history')}</h3>
            <p className="text-custom-300 text-md">{t('start_first_scan')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((scan) => (
              <div 
                key={scan.id} 
                onClick={() => setSelectedScan(scan)}
                className="bg-custom-900/70 backdrop-blur-md rounded-2xl shadow-xl border border-custom-700/60 p-6 cursor-pointer hover:border-custom-300/60 hover:bg-custom-900/90 hover:shadow-2xl hover:shadow-custom-900/50 hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="flex justify-between items-start mb-4 gap-4">
                  <h3 className="text-lg font-bold text-white group-hover:text-custom-300 line-clamp-2 leading-tight transition-colors">
                    {scan.productName || "Unknown Product"}
                  </h3>
                  <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    scan.healthStatus === 'PURPLE' ? 'bg-purple-900/90 text-purple-200 border border-purple-500/40 shadow-sm' :
                    scan.healthStatus === 'RED' ? 'bg-red-950/80 text-red-300 border border-red-500/40 shadow-sm' :
                    scan.healthStatus === 'YELLOW' ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm' :
                    'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  }`}>
                    {scan.healthStatus}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-custom-700/50 flex justify-between items-center">
                  <p className="text-xs text-custom-300 font-medium flex items-center">
                    <span className="mr-2">📅</span>
                    {new Date(scan.scannedAt).toLocaleDateString(undefined, { 
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                  <button 
                    onClick={(e) => deleteScan(scan.id, e)}
                    className="p-2 text-custom-300/60 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
                    title="Delete Scan"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center text-xs text-custom-300/70">
          ℹ️ Historical health indicators reflect guidelines at the time of scan. AI can make mistakes — always consult healthcare providers for medical advice.
        </div>
      </div>

      {/* Details Modal */}
      {selectedScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-custom-900/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-3xl my-8">
            <button
              onClick={() => setSelectedScan(null)}
              className="absolute -top-4 -right-4 bg-custom-900 text-custom-300 hover:text-white rounded-full w-10 h-10 shadow-lg flex items-center justify-center font-bold text-xl z-50 border border-custom-700 hover:border-custom-300 transition"
            >
              ×
            </button>
            <div className="max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl">
              <HealthStatusCard 
                assessment={(() => {
                  try {
                    return selectedScan.whoAssessmentJson 
                      ? (typeof selectedScan.whoAssessmentJson === 'string' ? JSON.parse(selectedScan.whoAssessmentJson) : selectedScan.whoAssessmentJson)
                      : { productName: selectedScan.productName, overallIndicator: selectedScan.healthStatus };
                  } catch (e) {
                    return { productName: selectedScan.productName, overallIndicator: selectedScan.healthStatus };
                  }
                })()} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryDashboard;
