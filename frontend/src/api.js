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

export default api;
