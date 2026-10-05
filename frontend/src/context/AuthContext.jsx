import React, { createContext, useState, useEffect } from 'react';
import api from '../api';
import HealthProfileModal from '../components/HealthProfileModal';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      return savedToken;
    }
    return null;
  });

  const [userProfile, setUserProfile] = useState(() => {
    const savedProfile = localStorage.getItem('userProfile');
    try {
      return savedProfile ? JSON.parse(savedProfile) : null;
    } catch {
      return null;
    }
  });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    if (token && user) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      fetchUserProfile();
    } else if (!token) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userProfile');
      setUserProfile(null);
    }
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const res = await api.get('/user/profile');
      setUserProfile(res.data);
      localStorage.setItem('userProfile', JSON.stringify(res.data));
      if (!res.data.profileCompleted) {
        setIsOnboarding(true);
        setIsProfileModalOpen(true);
      }
    } catch (err) {
      console.warn('Could not fetch user profile:', err);
    }
  };

  const login = (jwtToken, userData) => {
    setToken(jwtToken);
    setUser(userData);
    if (userData && userData.user) {
      setUserProfile(userData.user);
      localStorage.setItem('userProfile', JSON.stringify(userData.user));
      if (!userData.user.profileCompleted) {
        setIsOnboarding(true);
        setIsProfileModalOpen(true);
      }
    } else if (userData && userData.profileCompleted === false) {
      setIsOnboarding(true);
      setIsProfileModalOpen(true);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setUserProfile(null);
    setIsProfileModalOpen(false);
  };

  const openProfileModal = () => {
    setIsOnboarding(false);
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setIsOnboarding(false);
  };

  const handleProfileUpdated = (updatedProfile) => {
    setUserProfile(updatedProfile);
    localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      userProfile, 
      login, 
      logout, 
      openProfileModal, 
      closeProfileModal, 
      fetchUserProfile 
    }}>
      {children}
      {token && (
        <HealthProfileModal
          isOpen={isProfileModalOpen}
          onClose={closeProfileModal}
          initialProfile={userProfile}
          onProfileUpdated={handleProfileUpdated}
          isMandatoryOnboarding={isOnboarding}
        />
      )}
    </AuthContext.Provider>
  );
};
