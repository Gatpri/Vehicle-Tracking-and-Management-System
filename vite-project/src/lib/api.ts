import axios from "axios";

// Relative path so requests go through nginx's /api proxy on whatever host
// the browser used to load the page (localhost, a LAN IP, a tunnel domain,
// etc.) instead of hardcoding the backend's own host:port, which only ever
// worked when the browser happened to be on the same machine as Docker.
export const api = axios.create({
  baseURL: "/api",
  // Send the httpOnly session cookie with every request. This replaces the
  // old interceptor that read a token out of localStorage and built an
  // Authorization header by hand — there is no longer a token the page can
  // read, and the browser attaches the cookie on its own.
  withCredentials: true,
});

export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string })?.message || fallback;
  }
  return fallback;
};

export default api;
