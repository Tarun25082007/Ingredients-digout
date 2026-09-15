import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import HistoryDashboard from './components/HistoryDashboard';
import Login from './components/Login';
import Home from './pages/Home';

import { LanguageProvider } from './context/LanguageContext';

function App() {

  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-custom-900 text-white selection:bg-custom-500 selection:text-white">
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
    </LanguageProvider>
  );
}

export default App;
