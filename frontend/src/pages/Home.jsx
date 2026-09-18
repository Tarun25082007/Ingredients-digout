import React, { useState } from 'react';
import ScannerModal from '../components/ScannerModal';
import { useLanguage } from '../context/LanguageContext';

const Home = () => {
  const [showScanner, setShowScanner] = useState(false);
  const { t } = useLanguage();

  
  return (
    <div className="relative flex flex-col items-center justify-start min-h-[90vh] w-full">
      
      {/* Edge-to-edge Background Image */}
      <div 
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat fixed"
        style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
      >
        {/* Dark Overlay to make text pop */}
        <div className="absolute inset-0 bg-custom-900/50 backdrop-blur-[2px]"></div>
      </div>
      
      {/* Main Content Wrapper */}
      <div className="relative z-10 flex flex-col items-center w-full px-6 pt-24 pb-12 max-w-5xl mx-auto">
        
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-white mb-6 leading-tight tracking-tight drop-shadow-lg">
            {t('hero_title')}
          </h1>
          <p className="text-lg sm:text-xl text-custom-300 mb-8 max-w-2xl mx-auto font-medium drop-shadow-md">
            {t('hero_desc')}
          </p>
        </div>

        {/* Fake Search Bar to open Scanner */}
        <div 
          onClick={() => setShowScanner(true)}
          className="w-full max-w-2xl bg-white/95 backdrop-blur-md border-2 border-custom-300 shadow-xl shadow-custom-900/40 rounded-full px-6 py-4 flex items-center cursor-text hover:bg-white hover:scale-[1.02] transition-all duration-300 group"
        >
          <svg className="w-6 h-6 text-custom-500 mr-4 group-hover:text-custom-700 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <span className="text-custom-700 font-medium flex-1 text-left text-lg">
            {t('search_placeholder')}
          </span>
          <div className="bg-custom-500 text-white p-3 rounded-full group-hover:bg-custom-700 shadow-md transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
          </div>
        </div>
        
        {/* Mobile FAB */}
        <button 
          onClick={() => setShowScanner(true)}
          className="md:hidden fixed bottom-6 right-6 z-40 bg-custom-500 text-white p-4 rounded-full shadow-2xl hover:bg-custom-700 active:scale-90 transition-transform"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
          </svg>
        </button>
      </div>

      {showScanner && (
        <ScannerModal 
          onClose={() => setShowScanner(false)} 
        />
      )}

      <div className="z-10 mt-auto mb-8 text-center text-xs text-gray-300 font-medium drop-shadow-md px-6">
        ℹ️ {t('disclaimer')}
      </div>
    </div>
  );
};

export default Home;
