import React, { useState, useContext, useRef, useEffect } from 'react';
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

  const handleGoogleResponse = async (response) => {
    if (!response || !response.credential) {
      setError("Failed to get Google credentials. Please try again.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/google', { idToken: response.credential });
      const { token, user } = res.data;
      login(token, user);
      navigate('/');
    } catch (err) {
      console.error("Google sign-in error details:", err.response || err);
      const serverMsg = err.response?.data?.message || err.response?.data?.error;
      const statusText = err.response?.status ? ` (Status ${err.response.status})` : '';
      setError(serverMsg ? `${serverMsg}${statusText}` : (err.message || "Google sign-in failed. Please check backend connection."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initGoogle = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: "599673748564-91607cjjv7fdd1c7n7erri8bc9mbl6mq.apps.googleusercontent.com",
            callback: handleGoogleResponse
          });
          const btnDiv = document.getElementById("googleSignInDiv");
          if (btnDiv) {
            btnDiv.innerHTML = "";
            const computedWidth = Math.max(220, Math.min(window.innerWidth - 64, 360));
            window.google.accounts.id.renderButton(btnDiv, {
              theme: "outline",
              size: "large",
              width: computedWidth,
              text: isLoginMode ? "signin_with" : "signup_with",
              shape: "rectangular",
              logo_alignment: "left"
            });
          }
        } catch (e) {
          console.error("Google Auth init error:", e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const timer = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(timer);
          initGoogle();
        }
      }, 300);
      return () => clearInterval(timer);
    }
  }, [isLoginMode]);

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
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(newPassword);
    if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setError("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the captcha verification.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/update-password', {
        email: formData.email,
        oldPassword: formData.password,
        newPassword: newPassword,
        turnstileToken: turnstileToken
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
        const hasUpper = /[A-Z]/.test(formData.password);
        const hasLower = /[a-z]/.test(formData.password);
        const hasNumber = /[0-9]/.test(formData.password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password);
        if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
          setError("Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.");
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
      setTurnstileToken('');
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
                  <span className={/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? "✓" : "○"} Upper & Lowercase
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

            <div className="flex justify-center my-4 overflow-hidden">
              <div className="transform scale-90 sm:scale-100 origin-center">
                <Turnstile
                  siteKey="1x00000000000000000000AA"
                  onSuccess={(token) => setTurnstileToken(token)}
                  onExpire={() => setTurnstileToken('')}
                  onError={() => { setTurnstileToken(''); setError("Captcha error. Please try again."); }}
                />
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
    <div className="relative flex flex-col items-center justify-center min-h-[85vh] px-4 py-8 sm:p-6 w-full max-w-full overflow-hidden">
      {/* Edge-to-edge ambient background matching the outside */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/images/supermarket_blur.jpg')` }}
      >
        <div className="absolute inset-0 bg-custom-900/50 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md bg-emerald-50/95 backdrop-blur-xl p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-2xl border border-emerald-200 mx-auto">
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900">
            {isLoginMode ? t('welcome_back') : t('create_account')}
          </h2>
          <p className="text-gray-600 mt-2 font-medium text-sm">
            {isLoginMode 
              ? 'Log in to access and sync your scan history.' 
              : 'Sign up to unlock personalized health assessments.'}
          </p>
        </div>

        {successMsg && (
          <div className="p-4 rounded-xl mb-6 text-sm font-bold text-center border bg-emerald-50 text-emerald-700 border-emerald-200">
            ✅ {successMsg}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl mb-6 text-sm font-bold text-center border bg-red-50 text-red-700 border-red-200">
            {error}
          </div>
        )}

        {/* Google Sign-In */}
        <div className="mb-4 flex flex-col items-center">
          <div id="googleSignInDiv" className="w-full max-w-full flex justify-center min-h-[44px] overflow-hidden"></div>
          
          <div className="relative flex py-4 items-center w-full">
            <div className="flex-grow border-t border-emerald-200"></div>
            <span className="flex-shrink mx-4 text-gray-500 text-xs font-bold uppercase tracking-wider">
              {isLoginMode ? 'or log in with email' : 'or sign up with email'}
            </span>
            <div className="flex-grow border-t border-emerald-200"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLoginMode && (
            <div className="animate-fadeIn">
              <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">{t('full_name')}</label>
              <input 
                type="text" 
                name="fullName"
                required={!isLoginMode}
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition duration-200"
                placeholder="John Doe"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">{t('email_address')}</label>
            <input 
              type="email" 
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">{t('password')}</label>
            <input 
              type="password" 
              name="password"
              required
              value={formData.password}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition duration-200"
              placeholder="••••••••"
            />
            {!isLoginMode && (
              <div className="mt-2.5 p-3 bg-white border border-gray-200 rounded-xl space-y-1 text-xs">
                <p className="font-semibold text-gray-700 mb-1">Password Requirements:</p>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span className={formData.password.length >= 8 ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {formData.password.length >= 8 ? "✓" : "○"} 8+ Characters
                  </span>
                  <span className={/[A-Z]/.test(formData.password) && /[a-z]/.test(formData.password) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[A-Z]/.test(formData.password) && /[a-z]/.test(formData.password) ? "✓" : "○"} Upper & Lowercase
                  </span>
                  <span className={/[0-9]/.test(formData.password) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[0-9]/.test(formData.password) ? "✓" : "○"} 1+ Number
                  </span>
                  <span className={/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password) ? "text-emerald-600 font-bold flex items-center gap-1" : "text-gray-400 flex items-center gap-1"}>
                    {/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/.test(formData.password) ? "✓" : "○"} 1+ Special (!@#$)
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-center my-4 w-full max-w-full overflow-hidden">
            <div className="transform scale-90 sm:scale-100 origin-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
                onError={() => { setTurnstileToken(''); setError("Captcha error. Please try again."); }}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 flex justify-center items-center h-14"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              isLoginMode ? t('log_in') : t('sign_up')
            )}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-emerald-200/50">
          <p className="text-gray-600 font-medium text-sm">
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setError('');
                setSuccessMsg('');
                setTurnstileToken('');
                if (turnstileRef.current) turnstileRef.current.reset();
              }}
              className="text-emerald-700 font-bold hover:text-emerald-800 hover:underline transition ml-1"
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
