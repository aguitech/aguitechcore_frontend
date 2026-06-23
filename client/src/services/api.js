import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Routes that are publicly accessible — the 401 interceptor must NOT bounce
// visitors here to /login, otherwise visiting /public/blog without a token
// would break the listing.
const PUBLIC_PREFIXES = ['/public/'];

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const onPublic = PUBLIC_PREFIXES.some((p) => location.pathname.startsWith(p));
      if (!onPublic && location.pathname !== '/login') {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
