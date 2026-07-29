import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:3000",
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
