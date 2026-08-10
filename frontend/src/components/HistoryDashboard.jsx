import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const HistoryDashboard = () => {
  const { token, isGuest } = useContext(AuthContext);
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Protected route check: Redirect guests and unauthenticated users to login
    if (!token || isGuest) {
      navigate('/login');
      return;
    }

    const fetchHistory = async () => {
      try {
        const response = await api.get('/scan/history');
        setHistory(response.data);
      } catch (err) {
        setError('Failed to load scan history. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [token, isGuest, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-primary-dark rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-8">Your Scan History</h2>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-200 font-medium">
            ⚠️ {error}
          </div>
        )}

        {history.length === 0 && !error ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No scans yet</h3>
            <p className="text-gray-500 text-md">Your analyzed products will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {history.map((scan) => (
              <div key={scan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-lg hover:-translate-y-1 transition transform duration-200">
                <div className="flex justify-between items-start mb-4 gap-4">
                  <h3 className="text-lg font-bold text-gray-800 line-clamp-2 leading-tight">
                    {scan.productName || "Unknown Product"}
                  </h3>
                  <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    scan.healthStatus === 'RED' ? 'bg-red-100 text-red-800' :
                    scan.healthStatus === 'YELLOW' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {scan.healthStatus}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-50">
                  <p className="text-sm text-gray-500 flex items-center">
                    <span className="mr-2">📅</span>
                    {new Date(scan.scannedAt).toLocaleDateString(undefined, { 
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryDashboard;
