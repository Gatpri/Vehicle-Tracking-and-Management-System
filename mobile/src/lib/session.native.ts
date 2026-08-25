import * as SecureStore from "expo-secure-store";

/**
 * The device-side replacement for the web's httpOnly session cookie.
 *
 * The web app deliberately keeps its token somewhere page JavaScript cannot
 * reach (see backend_api/config/cookies.js). A native app has no equivalent,
 * so the nearest real protection is the OS keystore — Keychain on iOS,
 * EncryptedSharedPreferences on Android — which expo-secure-store wraps. That
 * is meaningfully stronger than AsyncStorage, which is a plaintext file any
 * process with the app's file access (or a rooted device) can read.
 *
 * The token is also cached in memory: it is read on nearly every request and
 * every socket connect, and a keystore round-trip is a real cost on Android.
 * The cache is the source of truth only after `loadToken` has run once at
 * startup, which is why AuthContext awaits it before rendering.
 */
const TOKEN_KEY = "session-token";

let cachedToken: string | null = null;

/** Read the token from the keystore into memory. Call once on app start. */
export const loadToken = async (): Promise<string | null> => {
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // A keystore read can fail on a device whose secure hardware is in a bad
    // state. Treat that as "not signed in" rather than crashing the app.
    cachedToken = null;
  }
  return cachedToken;
};

/** The token, without touching the keystore. Safe to call synchronously. */
export const getToken = (): string | null => cachedToken;

export const setToken = async (token: string): Promise<void> => {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Keep the in-memory copy even if persistence failed — the current
    // session still works, it just will not survive a restart.
  }
};

export const clearToken = async (): Promise<void> => {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Already gone, or the store is unavailable; memory is cleared either way.
  }
};
