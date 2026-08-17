import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import api from '../api';

const VariantComparison = ({ scannedIngredients, productName, globalEquivalent }) => {
  const { token, isGuest } = useContext(AuthContext);
  const [internationalData, setInternationalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token && !isGuest && productName) {
      const fetchComparison = async () => {
        setLoading(true);
        setError('');
        try {
          const response = await api.get(`/compare/search?name=${encodeURIComponent(productName)}`);
          setInternationalData(response.data);
        } catch (err) {
          // If original fails, try global equivalent
          if (globalEquivalent && globalEquivalent !== productName) {
            try {
              const response2 = await api.get(`/compare/search?name=${encodeURIComponent(globalEquivalent)}`);
              setInternationalData(response2.data);
              setLoading(false);
              return;
            } catch (err2) {
              // Fall through to error
            }
          }
          setError('Failed to load international comparison data. This product might not be available outside India, or it is not listed in the OpenFoodFacts database.');
          setInternationalData(null);
        } finally {
          setLoading(false);
        }
      };
      fetchComparison();
    }
  }, [token, isGuest, productName, globalEquivalent]);

  // Guest view - Blurred background with lock overlay
  if (isGuest || !token) {
    return (
      <div className="relative mt-8 rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm">
        <div className="absolute inset-0 bg-white/70 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-md border border-gray-100">
            <span className="text-3xl">🔒</span>
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 mb-2">International Comparison Locked</h3>
          <p className="text-gray-600 mb-6 max-w-md font-medium">
            Unlock the ability to compare your scanned product's ingredients with international versions from OpenFoodFacts.
          </p>
          <Link to="/login" className="bg-primary-dark hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition transform hover:-translate-y-1">
            Log in to unlock
          </Link>
        </div>
        
        {/* Fake blurred background content */}
        <div className="p-8 opacity-40 select-none pointer-events-none">
          <h3 className="text-xl font-bold mb-6">International Variant Comparison</h3>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 bg-white p-6 rounded-xl border border-gray-200 h-48 shadow-sm"></div>
            <div className="flex-1 bg-white p-6 rounded-xl border border-gray-200 h-48 shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated View
  return (
    <div className="mt-8 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="p-6 sm:p-8 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <h3 className="text-2xl font-extrabold text-gray-900">International Variant Comparison</h3>
        <p className="text-sm text-gray-500 mt-2 font-medium">Comparing your scan with the OpenFoodFacts global database</p>
      </div>

      <div className="p-6 sm:p-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-primary-dark rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="text-red-700 bg-red-50 p-4 rounded-xl border border-red-200 font-medium text-center">{error}</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8">
            {/* Column 1: Scanned Ingredients */}
            <div className="flex-1">
              <h4 className="font-bold text-gray-800 mb-4 flex items-center text-lg">
                <span className="bg-primary-light text-white w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 shadow-sm">1</span>
                Your Scanned Product {productName && `(${productName})`}
              </h4>
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 h-64 overflow-y-auto shadow-inner">
                <ul className="list-disc pl-5 space-y-2 text-gray-700 text-sm md:text-base">
                  {scannedIngredients && scannedIngredients.length > 0 ? (
                    scannedIngredients.map((ing, idx) => <li key={idx} className="capitalize">{typeof ing === 'string' ? ing : ing.name}</li>)
                  ) : (
                    <li className="text-gray-400 italic list-none">No ingredients provided. Scan a product first.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Column 2: International Data */}
            <div className="flex-1">
              <h4 className="font-bold text-gray-800 mb-4 flex items-center text-lg justify-between">
                <div className="flex items-center">
                  <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm mr-3 shadow-sm">2</span>
                  Global Version {internationalData && `(${internationalData.productName})`}
                </div>
              </h4>
              
              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 h-64 overflow-y-auto shadow-inner">
                {internationalData && internationalData.ingredientsText ? (
                  <ul className="list-disc pl-5 space-y-2 text-gray-800 text-sm md:text-base">
                    {internationalData.ingredientsText.split(',').map((ing, idx) => (
                      <li key={idx} className="capitalize">{ing.trim()}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-blue-400">
                    <span className="text-4xl mb-3">🌍</span>
                    <p className="italic text-sm">
                      {productName ? "Ingredients for this product (or its global equivalent) are not listed in the database yet." : "Scan a product to fetch data."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VariantComparison;
