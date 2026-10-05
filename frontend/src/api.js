import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // Proxied by Vite to bypass local SSL certificate issues
  timeout: 300000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const requestUrl = error.config?.url || '';
      // Don't redirect on auth endpoints (login/register failures return 401 legitimately)
      const isAuthRoute = requestUrl.includes('/auth/');
      if (!isAuthRoute && localStorage.getItem('token')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userProfile');
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
