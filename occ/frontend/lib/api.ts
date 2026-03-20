import axios, { AxiosHeaders } from 'axios';

function normalizeApiBase(url?: string) {
  const fallback = 'http://localhost:5000/api';
  const value = (url || fallback).trim().replace(/\/+$/, '');

  if (value.endsWith('/api')) {
    return value;
  }

  return `${value}/api`;
}

export const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

const API_URL = API_BASE;

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(
  (config) => {
    const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
    const headers = AxiosHeaders.from(config.headers);

    if (isFormData) {
      headers.delete('Content-Type');
    } else if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    config.headers = headers;

    // Add token if exists
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
