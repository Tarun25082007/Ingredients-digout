import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getUserCountry, setUserCountry, getAllCountries } from '../utils/countryUtils';
import { getLanguagesForCountry } from '../utils/languageUtils';
import { usePWA } from '../hooks/usePWA';

const Navbar = () => {
  const { user, token, userProfile, logout, openProfileModal } = useContext(AuthContext);
  const { language, setLanguage, t } = useLanguage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [country, setCountry] = useState(getUserCountry().toUpperCase());
  const countries = getAllCountries();
  const availableLanguages = getLanguagesForCountry(country);
  const location = useLocation();
  const isSubPage = location.pathname !== '/';
  const { isInstallable, installApp } = usePWA();

  const selectCountry = (selected) => {
    setCountry(selected.toUpperCase());
    setUserCountry(selected);
    setIsCountryOpen(false);
    
    // Automatically reset language if current language is not in the new country's list
    const newLangs = getLanguagesForCountry(selected);
    if (!newLangs.includes(language)) {
      setLanguage('English');
    }
  };

  const handleLanguageChange = (selectedLang) => {
    setLanguage(selectedLang);
    setIsLangOpen(false);
  };
  const dropdownRef = useRef(null);
  const langDropdownRef = useRef(null);
  const countryDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
        setIsLangOpen(false);
      }
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
        setIsCountryOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setIsLangOpen(false);
        setIsCountryOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isLoggedIn = !!token;

  return (
    <nav className="bg-custom-900/95 backdrop-blur-lg border-b border-custom-700 shadow-sm px-3 py-2.5 sm:px-6 sm:py-4 flex justify-between items-center sticky top-0 z-50 transition-all duration-300 w-full max-w-full">
      
      {/* Left side: Back Button (if on subpage) + Logo */}
      <div className="flex items-center gap-2 shrink-0">
        {isSubPage && (
          <Link
            to="/"
            className="p-1.5 sm:p-2 rounded-xl bg-custom-800 hover:bg-custom-700 text-custom-300 hover:text-white border border-custom-600 transition flex items-center justify-center active:scale-95 cursor-pointer shadow-sm"
            title={t('back_to_scanner') || "Back to Scanner"}
            aria-label={t('back_to_scanner') || "Back to Scanner"}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <Link to="/" className="font-extrabold text-custom-300 tracking-wide shrink-0 flex items-center">
          <span className="sm:hidden text-lg font-black tracking-tight">DigOut</span>
          <span className="hidden sm:inline text-xl sm:text-2xl">{t('app_title')}</span>
        </Link>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        
        {/* Install App Button */}
        {isInstallable && (
          <button 
            onClick={installApp}
            className="flex items-center gap-1.5 bg-custom-700 hover:bg-custom-500 text-white border border-custom-500 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-bold transition shadow-sm active:scale-95"
            title="Install App"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            <span className="hidden md:inline">{t('install_app')}</span>
          </button>
        )}

        {/* Country & Language Selectors */}
        <div className="relative flex gap-1 sm:gap-2">
          {/* Custom Country Selector */}
          <div className="relative" ref={countryDropdownRef}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={isCountryOpen}
              onClick={() => {
                setIsCountryOpen(prev => !prev);
                setIsLangOpen(false);
              }}
              className="flex items-center gap-1 bg-custom-700 border border-custom-500 text-white py-1.5 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-semibold shadow-sm hover:bg-custom-500 focus:outline-none focus:ring-2 focus:ring-custom-300 transition cursor-pointer active:scale-95"
              title="Set your regional database"
            >
              <span className="hidden sm:inline">{country === 'WORLD' ? t('global_world') : (countries.find(c => c.id.toUpperCase() === country.toUpperCase())?.name || country)}</span>
              <span className="sm:hidden">{country === 'WORLD' ? '🌍' : country}</span>
              <svg className={`fill-current h-3 w-3 sm:h-3.5 sm:w-3.5 text-custom-300 transition-transform ${isCountryOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </button>

            {isCountryOpen && (
              <div className="absolute right-0 sm:left-0 mt-2 w-44 max-h-64 overflow-y-auto overflow-x-hidden bg-custom-800 border border-custom-600 rounded-2xl shadow-2xl py-1.5 z-50 animate-fadeIn" style={{ maxWidth: 'calc(100vw - 32px)' }}>
                <button
                  type="button"
                  onClick={() => selectCountry('world')}
                  className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition ${
                    country === 'WORLD' 
                      ? 'bg-custom-600 text-white' 
                      : 'text-custom-100 hover:bg-custom-700 hover:text-white'
                  }`}
                >
                  {t('global_world')}
                </button>
                {countries.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCountry(c.id)}
                    className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition ${
                      country.toUpperCase() === c.id.toUpperCase()
                        ? 'bg-custom-600 text-white' 
                        : 'text-custom-100 hover:bg-custom-700 hover:text-white'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Custom Language Selector (100% Tailwind, No Windows Native White Canvas) */}
          <div className="relative" ref={langDropdownRef}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={isLangOpen}
              onClick={() => {
                setIsLangOpen(prev => !prev);
                setIsCountryOpen(false);
              }}
              className="flex items-center gap-1 bg-custom-700 border border-custom-500 text-white py-1.5 px-2.5 sm:px-3 rounded-full text-xs sm:text-sm font-semibold shadow-sm hover:bg-custom-500 focus:outline-none focus:ring-2 focus:ring-custom-300 transition cursor-pointer active:scale-95"
              title="Set preferred language"
            >
              <span className="hidden sm:inline">{language}</span>
              <span className="sm:hidden">{language.slice(0, 2).toUpperCase()}</span>
              <svg className={`fill-current h-3 w-3 sm:h-3.5 sm:w-3.5 text-custom-300 transition-transform ${isLangOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </button>

            {isLangOpen && (
              <div className="absolute right-0 mt-2 w-36 max-h-64 overflow-y-auto bg-custom-800 border border-custom-600 rounded-2xl shadow-2xl py-1.5 z-50 animate-fadeIn">
                {availableLanguages.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageChange(lang)}
                    className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition ${
                      language === lang 
                        ? 'bg-custom-600 text-white' 
                        : 'text-custom-100 hover:bg-custom-700 hover:text-white'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Unauthenticated View */}
        {!isLoggedIn && (
          <Link 
            to="/login"
            className="bg-primary-dark hover:bg-emerald-700 text-white px-3 py-1.5 sm:px-5 sm:py-2 rounded-full font-bold transition shadow-md hover:shadow-lg active:scale-95 text-xs sm:text-sm"
          >
            {t('login')}
          </Link>
        )}

        {/* State 3: Logged In */}
        {isLoggedIn && (
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary-dark text-white hover:bg-emerald-700 transition font-bold shadow-md hover:shadow-lg active:scale-95 border-2 border-white text-xs sm:text-sm"
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
                  className="w-full text-left px-4 py-2 text-sm text-emerald-700 font-medium hover:bg-emerald-50 flex items-center justify-between"
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
