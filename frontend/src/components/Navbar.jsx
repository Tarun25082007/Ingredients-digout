import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getUserCountry, setUserCountry, getAllCountries } from '../utils/countryUtils';
import { getLanguagesForCountry } from '../utils/languageUtils';
import { usePWA } from '../hooks/usePWA';

const Navbar = () => {
  const { user, token, userProfile, isGuest, logout, continueAsGuest, openProfileModal } = useContext(AuthContext);
  const { language, setLanguage, t } = useLanguage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [country, setCountry] = useState(getUserCountry().toUpperCase());
  const countries = getAllCountries();
  const availableLanguages = getLanguagesForCountry(country);
  const { isInstallable, installApp } = usePWA();

  const handleCountryChange = (e) => {
    const selected = e.target.value;
    setCountry(selected.toUpperCase());
    setUserCountry(selected);
    
    // Automatically reset language if current language is not in the new country's list
    const newLangs = getLanguagesForCountry(selected);
    if (!newLangs.includes(language)) {
      setLanguage('English');
    }
  };

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isLoggedIn = !!token;

  return (
    <nav className="bg-custom-900/95 backdrop-blur-lg border-b border-custom-700 shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-50 transition-all duration-300">
      
      {/* Left side: Logo */}
      <Link to="/" className="text-2xl font-extrabold text-custom-300 tracking-wide">
        {t('app_title')}
      </Link>

      {/* Right side: Actions */}
      <div className="flex items-center space-x-4">
        
        {/* Install App Button */}
        {isInstallable && (
          <button 
            onClick={installApp}
            className="flex items-center gap-1.5 bg-custom-700 hover:bg-custom-500 text-white border border-custom-500 px-3 py-1.5 rounded-full text-sm font-bold transition shadow-sm active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            {t('install_app')}
          </button>
        )}

        
        {/* Country Selector */}
        <div className="relative mr-2 flex gap-2">
          <div className="relative">
            <select 
              value={country.toLowerCase()} 
              onChange={handleCountryChange}
              className="appearance-none bg-custom-700 border border-custom-500 text-white py-1.5 pl-3 pr-8 rounded-full text-sm font-semibold shadow-sm hover:bg-custom-500 focus:outline-none focus:ring-2 focus:ring-custom-300 transition cursor-pointer active:scale-95"
              title="Set your regional database"
            >
              <option value="world">{t('global_world')}</option>
              {countries.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-custom-300">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
          
          {/* Language Selector */}
          <div className="relative">
            <select 
              value={language}
              onChange={handleLanguageChange}
              className="appearance-none bg-custom-700 border border-custom-500 text-white py-1.5 pl-3 pr-8 rounded-full text-sm font-semibold shadow-sm hover:bg-custom-500 focus:outline-none focus:ring-2 focus:ring-custom-300 transition cursor-pointer active:scale-95"
              title="Set preferred language"
            >
              {availableLanguages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-custom-300">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        {/* State 1: Completely unauthenticated */}
        {(!isLoggedIn && !isGuest) && (
          <>
            <button 
              onClick={continueAsGuest}
              className="text-gray-600 hover:text-primary-dark font-semibold transition active:scale-95"
            >
              {t('guest_mode')}
            </button>
            <Link 
              to="/login"
              className="bg-primary-dark hover:bg-emerald-700 text-white px-5 py-2 rounded-full font-bold transition shadow-md hover:shadow-lg active:scale-95"
            >
              {t('login')}
            </Link>
          </>
        )}

        {/* State 2: Active Guest Mode */}
        {(isGuest && !isLoggedIn) && (
          <Link 
            to="/login"
            className="bg-primary-dark hover:bg-emerald-700 text-white px-5 py-2 rounded-full font-bold transition shadow-md hover:shadow-lg active:scale-95"
          >
            {t('login_to_save')}
          </Link>
        )}

        {/* State 3: Logged In */}
        {isLoggedIn && (
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-dark text-white hover:bg-emerald-700 transition font-bold shadow-md hover:shadow-lg active:scale-95 border-2 border-white"
            >
              {/* Fallback avatar letter */}
              {(userProfile?.fullName || user?.fullName || user?.name || 'U').charAt(0).toUpperCase()}
            </button>

            {/* Profile Dropdown */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl py-2">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {userProfile?.fullName || user?.fullName || user?.name || 'User'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    openProfileModal();
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left block px-4 py-2 text-sm text-emerald-700 font-medium hover:bg-emerald-50 flex items-center justify-between"
                >
                  <span>🩺 {t('health_profile')}</span>
                  {userProfile?.profileCompleted ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">{t('active')}</span>
                  ) : (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">{t('setup')}</span>
                  )}
                </button>
                <Link 
                  to="/history" 
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-dark"
                  onClick={() => setDropdownOpen(false)}
                >
                  {t('scan_history')}
                </Link>
                <button 
                  onClick={() => {
                    logout();
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  {t('logout')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
