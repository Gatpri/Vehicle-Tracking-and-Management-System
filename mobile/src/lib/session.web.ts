/**
 * Session storage in a browser.
 *
 * expo-secure-store's web build is an empty stub — it stores nothing — so
 * without this file a browser session would vanish on every page reload. The
 * OS keystore the native version relies on has no browser equivalent, so the
 * honest choice here is localStorage, with clear eyes about what that means.
 *
 * **This is weaker than both other targets, deliberately and unavoidably.**
 * A token in localStorage is readable by any script running on the page, which
 * is exactly the exposure the main web app (vite-project) avoids by keeping
 * its session in an httpOnly cookie. That app remains the hardened way to use
 * this platform in a browser; this build is the same codebase as the phone
 * apps, run in a browser for development and demonstration.
 *
 * sessionStorage was considered and rejected: it is per-tab and cleared on
 * close, which trades a small security gain for a sign-in on every new tab.
 * The exposure is the same either way — any injected script can read both.
 */
const TOKEN_KEY = "session-token";

let cachedToken: string | null = null;

/**
 * localStorage throws rather than returning null when a browser blocks storage
 * — Safari private mode, or a third-party iframe. Each accessor is guarded so
 * a blocked store degrades to an in-memory session instead of a crash.
 */
const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
};

export const loadToken = async (): Promise<string | null> => {
  try {
    cachedToken = safeStorage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
};

export const getToken = (): string | null => cachedToken;

export const setToken = async (token: string): Promise<void> => {
  cachedToken = token;
  try {
    safeStorage()?.setItem(TOKEN_KEY, token);
  } catch {
    // Keep the in-memory copy even if persistence failed — the current session
    // still works, it just will not survive a reload.
  }
};

export const clearToken = async (): Promise<void> => {
  cachedToken = null;
  try {
    safeStorage()?.removeItem(TOKEN_KEY);
  } catch {
    // Already gone, or the store is unavailable; memory is cleared either way.
  }
};
