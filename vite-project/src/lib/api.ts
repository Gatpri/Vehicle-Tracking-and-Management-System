import axios from "axios";

// Relative path so requests go through nginx's /api proxy on whatever host
// the browser used to load the page (localhost, a LAN IP, a tunnel domain,
// etc.) instead of hardcoding the backend's own host:port, which only ever
// worked when the browser happened to be on the same machine as Docker.
export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message || fallback;
  }
  return fallback;
};

export default api;
