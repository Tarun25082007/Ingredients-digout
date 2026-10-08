import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import HealthStatusCard from './HealthStatusCard';

const HistoryDashboard = () => {
  const { token, logout } = useContext(AuthContext);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedScan, setSelectedScan] = useState(null);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    const abortController = new AbortController();

    const fetchHistory = async () => {
      try {
        const response = await api.get('/scan/history', { signal: abortController.signal });
        // Parse JSON once during fetch to avoid blocking the render loop
        const parsedHistory = response.data.map(scan => {
          let parsedData = null;
          try {
            parsedData = scan.whoAssessmentJson
              ? (typeof scan.whoAssessmentJson === 'string' ? JSON.parse(scan.whoAssessmentJson) : scan.whoAssessmentJson)
              : null;
          } catch (e) {}
          return { ...scan, parsedAssessment: parsedData };
        });
        
        setHistory(parsedHistory);
        setError(''); // clear any previous errors
      } catch (err) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        
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
    return () => abortController.abort();
  }, [token, navigate]);

  const deleteScan = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm(t('confirm_delete_scan'))) return;
    
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
          <div className="absolute inset-0 bg-custom-900/50 backdrop-blur-[2px]"></div>
        </div>
        <div className="relative z-10 w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[90vh] py-6 sm:py-10 px-4 sm:px-6 w-full max-w-full overflow-hidden">
      {/* Edge-to-edge ambient background matching the home page */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
      >
        <div className="absolute inset-0 bg-custom-900/50 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8 bg-emerald-50/95 p-4 sm:p-6 rounded-2xl shadow-lg border border-emerald-200">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{t('scan_history')}</h2>
          <p className="text-gray-600 text-xs sm:text-sm font-medium mt-1">{t('scan_history_desc')}</p>
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-200 backdrop-blur-md font-medium">
            ⚠️ {error}
          </div>
        )}

        {history.length === 0 && !error ? (
          <div className="text-center py-20 bg-emerald-50/95 backdrop-blur-md rounded-3xl shadow-xl border border-emerald-200">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('no_history')}</h3>
            <p className="text-gray-600 text-md">{t('start_first_scan')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((scan) => {
              const assessmentData = scan.parsedAssessment;
              const score = assessmentData?.healthScore;

              return (
                <div 
                  key={scan.id} 
                  onClick={() => setSelectedScan(scan)}
                  className="bg-emerald-50/95 backdrop-blur-md rounded-2xl shadow-xl border border-emerald-200 p-6 cursor-pointer hover:border-emerald-400 hover:bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 line-clamp-2 leading-tight transition-colors">
                      {scan.productName || "Unknown Product"}
                    </h3>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {score != null && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black tracking-tight border ${
                          score >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                          score >= 55 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                          score >= 30 ? 'bg-orange-100 text-orange-800 border-orange-300' :
                          'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {score}/100
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        scan.healthStatus === 'PURPLE' ? 'bg-purple-100 text-purple-800 border border-purple-200 shadow-sm' :
                        scan.healthStatus === 'RED' ? 'bg-red-100 text-red-800 border border-red-200 shadow-sm' :
                        scan.healthStatus === 'YELLOW' ? 'bg-amber-100 text-amber-800 border border-amber-200 shadow-sm' :
                        'bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm'
                      }`}>
                        {scan.healthStatus}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-emerald-200/50 flex justify-between items-center">
                    <p className="text-xs text-gray-600 font-medium flex items-center">
                      <span className="mr-2">📅</span>
                      {scan.scannedAt ? new Date(String(scan.scannedAt).endsWith('Z') ? scan.scannedAt : scan.scannedAt + 'Z').toLocaleDateString(undefined, { 
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      }) : t('recent')}
                    </p>
                    <button 
                      onClick={(e) => deleteScan(scan.id, e)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      title={t('delete_scan')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 text-center text-xs text-custom-300/70">
          ℹ️ {t('history_disclaimer')}
        </div>
      </div>

      {/* Details Modal */}
      {selectedScan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-custom-900/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-3xl my-8">
            <button
              onClick={() => setSelectedScan(null)}
              aria-label="Close details"
              className="absolute -top-4 -right-4 bg-custom-900 text-custom-300 hover:text-white rounded-full w-10 h-10 shadow-lg flex items-center justify-center font-bold text-xl z-50 border border-custom-700 hover:border-custom-300 transition"
            >
              ×
            </button>
            <div className="max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl">
              <HealthStatusCard 
                assessment={selectedScan.parsedAssessment || { productName: selectedScan.productName, overallIndicator: selectedScan.healthStatus }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryDashboard;
