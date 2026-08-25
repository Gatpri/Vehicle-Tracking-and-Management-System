import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the Express backend lives, from the phone's point of view.
 *
 * This is the one setting that genuinely cannot be guessed. The web app gets
 * away with a relative "/api" because the browser already loaded the page from
 * the server that serves the API. A phone has no such origin: "localhost" on a
 * device means the device itself, so it must be given a real, reachable
 * address.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL, if set — an explicit override always wins.
 *   2. The host serving the Metro bundle. When you run `npx expo start`, the
 *      dev server prints an address like 192.168.1.5:8081; the device is
 *      already talking to that machine, so the backend is almost always on
 *      that same host at port 3000. Deriving it means a LAN IP change needs
 *      no edit here.
 *   3. The Android emulator's 10.0.2.2 alias for the host machine, which is
 *      the one case where a fixed value is right.
 */
const DEV_API_PORT = 3000;

const hostFromExpo = (): string | null => {
  // hostUri looks like "192.168.1.5:8081" while the dev server is running.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split(":")[0];
  return host && host !== "localhost" && host !== "127.0.0.1" ? host : null;
};

const resolveBaseUrl = (): string => {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  // In a browser the page already has a real origin, and the backend is
  // normally behind the same nginx that served it — so the host the user
  // typed is the right one, not a guessed LAN address. Falling through to the
  // Metro-host logic here would break any deployed web build, which has no
  // Metro server at all.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    // A page served by Metro (8081) or Vite (5173) is a dev server that does
    // not proxy /api, so the backend is addressed directly on its own port.
    const isDevServer = port === "8081" || port === "5173";
    return isDevServer ? `${protocol}//${hostname}:${DEV_API_PORT}` : window.location.origin;
  }

  const lanHost = hostFromExpo();
  if (lanHost) return `http://${lanHost}:${DEV_API_PORT}`;

  // Android's emulator maps 10.0.2.2 to the host's loopback; iOS simulators
  // share the host's network, so plain localhost is correct there.
  const fallbackHost = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  return `http://${fallbackHost}:${DEV_API_PORT}`;
};

/** Server root, e.g. http://192.168.1.5:3000 — no trailing slash. */
export const SERVER_URL = resolveBaseUrl();

/** Where the Express routes are mounted (index.js mounts everything on /api). */
export const API_URL = `${SERVER_URL}/api`;

/**
 * Marks requests as coming from the native app. The backend
 * (config/clientKind.js) uses it to decide whether to include the session
 * token in a login response body — browsers must never get it there.
 */
export const CLIENT_HEADER = "x-client";
export const CLIENT_VALUE = "mobile";
