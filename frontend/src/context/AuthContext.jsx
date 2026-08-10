import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      setIsGuest(false);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  const login = (jwtToken, userData) => {
    setToken(jwtToken);
    setUser(userData);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setIsGuest(false);
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isGuest, login, logout, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
};
