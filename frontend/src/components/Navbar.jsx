import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Navbar = () => {
  const { user, token, isGuest, logout, continueAsGuest } = useContext(AuthContext);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isLoggedIn = !!token;

  return (
    <nav className="bg-white shadow-md px-6 py-4 flex justify-between items-center sticky top-0 z-50">
      
      {/* Left side: Logo */}
      <Link to="/" className="text-2xl font-extrabold text-primary-dark tracking-wide">
        The Ingredient Digout
      </Link>

      {/* Right side: Actions */}
      <div className="flex items-center space-x-4">
        
        {/* State 1: Completely unauthenticated */}
        {(!isLoggedIn && !isGuest) && (
          <>
            <button 
              onClick={continueAsGuest}
              className="text-gray-600 hover:text-primary-dark font-medium transition"
            >
              Guest Mode
            </button>
            <Link 
              to="/login"
              className="bg-primary-light hover:bg-primary-dark text-white px-5 py-2 rounded-lg font-semibold transition shadow-sm"
            >
              Login
            </Link>
          </>
        )}

        {/* State 2: Active Guest Mode */}
        {(isGuest && !isLoggedIn) && (
          <Link 
            to="/login"
            className="bg-primary-light hover:bg-primary-dark text-white px-5 py-2 rounded-lg font-semibold transition shadow-sm"
          >
            Login to Save Scans
          </Link>
        )}

        {/* State 3: Logged In */}
        {isLoggedIn && (
          <div className="relative">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-dark text-white hover:bg-emerald-700 transition font-bold shadow-sm"
            >
              {/* Fallback avatar letter */}
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </button>

            {/* Profile Dropdown */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl py-2">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.name || 'User'}
                  </p>
                </div>
                <Link 
                  to="/history" 
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-dark"
                  onClick={() => setDropdownOpen(false)}
                >
                  Scan History
                </Link>
                <button 
                  onClick={() => {
                    logout();
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Logout
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
