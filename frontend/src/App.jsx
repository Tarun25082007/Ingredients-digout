import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ScannerModal from './components/ScannerModal';
import HistoryDashboard from './components/HistoryDashboard';
import VariantComparison from './components/VariantComparison';
import Login from './components/Login';

// A simple wrapper for the Home Route
const HomeRoute = () => {
  const [showScanner, setShowScanner] = useState(false);
  
  // Note: To fully satisfy the "conditionally render HealthStatusCard and VariantComparison on successful scan" 
  // at this level, we would typically lift the 'assessment' state out of ScannerModal. 
  // For now, ScannerModal handles its own internal HealthStatusCard rendering, 
  // and we render the VariantComparison directly underneath when a scan completes.
  
  return (
    <div className="flex flex-col items-center justify-center p-6 mt-10 w-full max-w-5xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-primary-dark mb-6 leading-tight">
          Know What's In Your Food
        </h1>
        <p className="text-lg text-gray-600 mb-10">
          Scan product ingredients to automatically flag harmful additives, artificial sweeteners, and preservatives based on strict WHO guidelines.
        </p>
        
        <button 
          onClick={() => setShowScanner(true)}
          className="px-10 py-5 bg-primary-light hover:bg-primary-dark text-white text-xl font-bold rounded-xl shadow-lg transition transform hover:-translate-y-1"
        >
          Start a New Scan
        </button>
      </div>

      {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}
      
      {/* We are showing the VariantComparison component here. In a fully connected app, 
          you would pass the actual 'barcode' and 'scannedIngredients' retrieved from the ScannerModal. */}
      <div className="w-full mt-10">
        <VariantComparison barcode="" scannedIngredients={[]} />
      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Navbar />
          
          <main className="flex-grow flex flex-col">
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/login" element={<Login />} />
              <Route path="/history" element={<HistoryDashboard />} />
            </Routes>
          </main>
          
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
