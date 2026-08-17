import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ScannerModal from './components/ScannerModal';
import HistoryDashboard from './components/HistoryDashboard';
import VariantComparison from './components/VariantComparison';
import Login from './components/Login';
import Home from './pages/Home';



function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Navbar />
          
          <main className="flex-grow flex flex-col">
            <Routes>
              <Route path="/" element={<Home />} />
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
