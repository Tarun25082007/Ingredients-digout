import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api';

const Login = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLoginMode) {
        // Handle Login
        const response = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password
        });
        
        // Extract JWT and user details from backend response
        const { token, user } = response.data;
        
        // Update global auth state
        login(token, user || { email: formData.email, name: formData.email.split('@')[0] });
        
        // Redirect to Home/Scanner page
        navigate('/');
      } else {
        // Handle Registration
        await api.post('/auth/register', {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password
        });
        
        // Reset form and switch to login mode with success message
        setIsLoginMode(true);
        setError('Registration successful! Please log in.');
      }
    } catch (err) {
      if (typeof err.response?.data === 'string') {
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 bg-gray-50">
      <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl shadow-xl border border-gray-100">
        
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-primary-dark">
            {isLoginMode ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="text-gray-500 mt-3 font-medium">
            {isLoginMode 
              ? 'Log in to save your scan history.' 
              : 'Sign up to unlock international comparisons.'}
          </p>
        </div>

        {error && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-bold text-center border ${
            error.includes('successful') 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLoginMode && (
            <div className="animate-fadeIn">
              <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Full Name</label>
              <input 
                type="text" 
                name="fullName"
                required={!isLoginMode}
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-light focus:ring-4 focus:ring-primary-light/20 outline-none transition duration-200"
                placeholder="John Doe"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Email Address</label>
            <input 
              type="email" 
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-light focus:ring-4 focus:ring-primary-light/20 outline-none transition duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Password</label>
            <input 
              type="password" 
              name="password"
              required
              value={formData.password}
              onChange={handleInputChange}
              className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary-light focus:ring-4 focus:ring-primary-light/20 outline-none transition duration-200"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-2 bg-primary-light hover:bg-emerald-600 text-white text-lg font-bold rounded-xl shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 flex justify-center items-center h-14"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              isLoginMode ? 'Log In' : 'Sign Up'
            )}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-gray-100">
          <p className="text-gray-500 font-medium text-sm">
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setError('');
              }}
              className="text-primary-dark font-bold hover:text-emerald-700 hover:underline transition ml-1"
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
