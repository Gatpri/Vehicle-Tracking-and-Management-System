import axios from "axios";
import { API_URL, CLIENT_HEADER, CLIENT_VALUE } from "./config";
import { getToken } from "./session";

/**
 * Native counterpart to the web app's src/lib/api.ts.
 *
 * Two deliberate differences from the web version:
 *
 *   baseURL is absolute. The web app uses a relative "/api" so nginx can proxy
 *   from whatever host the browser used. A phone has no such origin, so the
 *   address is resolved explicitly — see config.ts.
 *
 *   The session travels in an Authorization header rather than a cookie. The
 *   web app can rely on `withCredentials` because the browser owns a cookie
 *   jar; here the token comes out of the device keystore and is attached by
 *   the interceptor below. The backend accepts either (middleware/auth.js),
 *   preferring the cookie so browser behaviour is unchanged.
 */
export const api = axios.create({
  baseURL: API_URL,
  // Identifies this client to the backend so login responses include the
  // token — see backend_api/config/clientKind.js.
  headers: { [CLIENT_HEADER]: CLIENT_VALUE },
  // A phone can sit on a stalled cellular connection indefinitely. Without a
  // timeout, a request in that state hangs forever and the screen's loading
  // spinner never resolves.
  timeout: 20000,
});

// Read the token per-request rather than setting it once at login: the same
// axios instance outlives sign-in and sign-out, so a value baked in at
// creation would be stale the moment the user switched accounts.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Unchanged from the web app on purpose — screen code ported from the web
 * calls this exactly as it did there.
 *
 * The extra branch is for network failures, which barely happen in a browser
 * on a desk but are routine on a phone: with no response at all, err.response
 * is undefined and the web version would silently return the generic
 * fallback, hiding the fact that the device is simply offline.
 */
export const getErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return err.code === "ECONNABORTED"
        ? "The server took too long to respond."
        : "Cannot reach the server. Check your connection.";
    }
    return (err.response.data as { message?: string })?.message || fallback;
  }
  return fallback;
};

export default api;
