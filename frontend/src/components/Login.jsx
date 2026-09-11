import React, { useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Turnstile } from '@marsidev/react-turnstile';
import api from '../api';

const Login = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  
  // Password Reset State
  const [requiresReset, setRequiresReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  const { login } = useContext(AuthContext);
  const { t } = useLanguage();
  const navigate = useNavigate();
  const turnstileRef = useRef();

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate new password constraints
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(newPassword);
    if (!hasLetter || !hasNumber || !hasSpecial) {
      setError("Password must contain at least one letter, one number, and one special character.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/update-password', {
        email: formData.email,
        oldPassword: formData.password,
        newPassword: newPassword
      });
      const { token, user } = response.data;
      login(token, user || { email: formData.email, name: formData.email.split('@')[0] });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    
    if (!turnstileToken) {
      setError("Please complete the captcha verification.");
      return;
    }

    setLoading(true);

    try {
      if (isLoginMode) {
        // Handle Login
        const response = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password,
          turnstileToken
        });
        
        const { token, user } = response.data;
        login(token, user || { email: formData.email, name: formData.email.split('@')[0] });
        navigate('/');
      } else {
        // Validate password constraints on registration
        if (formData.password.length < 8) {
          setError("Password must be at least 8 characters long.");
          setLoading(false);
          if (turnstileRef.current) turnstileRef.current.reset();
          return;
        }
        const hasLetter = /[a-zA-Z]/.test(formData.password);
        const hasNumber = /[0-9]/.test(formData.password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password);
        if (!hasLetter || !hasNumber || !hasSpecial) {
          setError("Password must contain at least one letter, one number, and one special character.");
          setLoading(false);
          if (turnstileRef.current) turnstileRef.current.reset();
          return;
        }

        // Handle Registration
        await api.post('/auth/register', {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          turnstileToken
        });
        
        setFormData({ fullName: '', email: '', password: '' });
        setIsLoginMode(true);
        setSuccessMsg('Account created! Please log in.');
        if (turnstileRef.current) turnstileRef.current.reset();
      }
    } catch (err) {
      if (err.response?.status === 426) {
        // HTTP 426 Upgrade Required
        setRequiresReset(true);
        setError(err.response.data.message);
      } else if (typeof err.response?.data === 'string') {
        setError(err.response.data);
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.status === 401) {
        setError("Invalid email or password.");
      } else if (err.response?.status === 409 || err.response?.status === 400) {
        setError("Registration failed. Email might already be in use.");
      } else {
        setError("An unexpected error occurred. Please check your connection and try again.");
      }
      if (turnstileRef.current && err.response?.status !== 426) {
         turnstileRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  if (requiresReset) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 bg-gray-50">
        <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100 animate-fadeIn">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              🔒
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900">Security Upgrade</h2>
            <p className="text-gray-500 mt-2 text-sm font-medium">
              We've strengthened our security. Please update your password to continue.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl mb-6 text-sm font-bold text-center border bg-amber-50 text-amber-800 border-amber-200">
              {error}
            </div>
          )}

          <form onSubmit={handleResetSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">New Password</label>
              <input 
                type="password" 
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-light focus:ring-4 focus:ring-primary-light/20 outline-none transition duration-200"
                placeholder="••••••••"
              />
              <div className="mt-2.5 p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-1 text-xs">
                <p className="font-semibold text-gray-600 mb-1">Password Requirements:</p>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span className={newPassword.length >= 8 ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {newPassword.length >= 8 ? "✓" : "○"} 8+ Characters
                  </span>
                  <span className={/[a-zA-Z]/.test(newPassword) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[a-zA-Z]/.test(newPassword) ? "✓" : "○"} 1+ Letter
                  </span>
                  <span className={/[0-9]/.test(newPassword) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[0-9]/.test(newPassword) ? "✓" : "○"} 1+ Number
                  </span>
                  <span className={/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(newPassword) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(newPassword) ? "✓" : "○"} 1+ Special
                  </span>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-4 mt-2 bg-gray-900 hover:bg-black text-white text-lg font-bold rounded-xl shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 flex justify-center items-center h-14"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[85vh] p-6">
      {/* Edge-to-edge ambient background matching the outside */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
      >
        <div className="absolute inset-0 bg-custom-900/85 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md bg-custom-900/80 backdrop-blur-xl p-8 sm:p-10 rounded-3xl shadow-2xl border border-custom-700/60">
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-white">
            {isLoginMode ? t('welcome_back') : t('create_account')}
          </h2>
          <p className="text-custom-300 mt-2 font-medium text-sm">
            {isLoginMode 
              ? 'Log in to access and sync your scan history.' 
              : 'Sign up to unlock personalized health assessments.'}
          </p>
        </div>

        {successMsg && (
          <div className="p-4 rounded-xl mb-6 text-sm font-bold text-center border bg-emerald-950/80 text-emerald-300 border-emerald-500/40">
            ✅ {successMsg}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl mb-6 text-sm font-bold text-center border bg-red-950/80 text-red-300 border-red-500/40">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLoginMode && (
            <div className="animate-fadeIn">
              <label className="block text-sm font-bold text-custom-300 mb-1.5 ml-1">{t('full_name')}</label>
              <input 
                type="text" 
                name="fullName"
                required={!isLoginMode}
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-5 py-3.5 rounded-xl border border-custom-700 bg-custom-900/70 text-white placeholder:text-custom-300/40 focus:bg-custom-900 focus:border-custom-300 focus:ring-4 focus:ring-custom-500/20 outline-none transition duration-200"
                placeholder="John Doe"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-custom-300 mb-1.5 ml-1">{t('email_address')}</label>
            <input 
              type="email" 
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-custom-700 bg-custom-900/70 text-white placeholder:text-custom-300/40 focus:bg-custom-900 focus:border-custom-300 focus:ring-4 focus:ring-custom-500/20 outline-none transition duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-custom-300 mb-1.5 ml-1">{t('password')}</label>
            <input 
              type="password" 
              name="password"
              required
              value={formData.password}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-custom-700 bg-custom-900/70 text-white placeholder:text-custom-300/40 focus:bg-custom-900 focus:border-custom-300 focus:ring-4 focus:ring-custom-500/20 outline-none transition duration-200"
              placeholder="••••••••"
            />
            {!isLoginMode && (
              <div className="mt-2.5 p-3 bg-custom-900/90 border border-custom-700/80 rounded-xl space-y-1 text-xs">
                <p className="font-semibold text-custom-300 mb-1">Password Requirements:</p>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span className={formData.password.length >= 8 ? "text-emerald-400 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {formData.password.length >= 8 ? "✓" : "○"} 8+ Characters
                  </span>
                  <span className={/[a-zA-Z]/.test(formData.password) ? "text-emerald-400 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[a-zA-Z]/.test(formData.password) ? "✓" : "○"} 1+ Letter
                  </span>
                  <span className={/[0-9]/.test(formData.password) ? "text-emerald-400 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[0-9]/.test(formData.password) ? "✓" : "○"} 1+ Number
                  </span>
                  <span className={/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password) ? "text-emerald-400 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password) ? "✓" : "○"} 1+ Special (!@#$)
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-center my-4">
            <Turnstile
              ref={turnstileRef}
              siteKey="1x00000000000000000000AA"
              onSuccess={(token) => setTurnstileToken(token)}
              onError={() => setError("Captcha error. Please try again.")}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-2 bg-custom-500 hover:bg-custom-700 text-white text-lg font-bold rounded-xl shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 flex justify-center items-center h-14"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              isLoginMode ? t('log_in') : t('sign_up')
            )}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-custom-700/50">
          <p className="text-custom-300/80 font-medium text-sm">
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setError('');
                setSuccessMsg('');
                if (turnstileRef.current) turnstileRef.current.reset();
              }}
              className="text-white font-bold hover:text-custom-300 hover:underline transition ml-1"
            >
              {isLoginMode ? 'Create one now' : 'Log in here'}
            </button>
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;
