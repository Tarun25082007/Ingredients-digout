import axios from 'axios';

const api = axios.create({
  baseURL: 'https://localhost:8443/api', // Pointing to Spring Boot backend
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
