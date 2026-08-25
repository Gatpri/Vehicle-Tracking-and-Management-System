import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import { SERVER_URL } from "./config";
import { getToken } from "./session";

let socket: Socket | null = null;

/**
 * Native counterpart to the web app's src/lib/socket.ts.
 *
 * The web version connects with no URL and no auth payload: the browser knows
 * its own origin and attaches the session cookie to the handshake by itself.
 * Neither holds here, so both are supplied explicitly — the URL from config,
 * and the token in `auth`, which config/socket.js reads as its fallback when
 * no cookie is present.
 *
 * `auth` is a function rather than an object on purpose. Passed as an object,
 * socket.io captures the value once and would keep replaying the token from
 * whoever was signed in when the socket was first created — the exact stale
 * -token bug the web app removed by moving to cookies. As a function it is
 * re-evaluated on every reconnect, so the current token is always sent.
 */
export const getSocket = (): Socket => {
  if (socket) return socket;

  socket = io(SERVER_URL, {
    auth: (cb) => cb({ token: getToken() }),
    // On a phone, skip the HTTP long-polling handshake and open a websocket
    // directly: the polling upgrade path is unreliable on mobile networks and
    // costs an extra round-trip on a connection that is already slow.
    //
    // In a browser, keep polling as a fallback. Corporate proxies and captive
    // portals still block raw websockets, and there a websocket-only client
    // fails outright instead of degrading — the browser has no cellular
    // connection to fall back to the way a phone does.
    transports: Platform.OS === "web" ? ["websocket", "polling"] : ["websocket"],
    // Sends cookies on the handshake, which is what lets a browser session
    // authenticate the same way the main web app does. Ignored on native,
    // where the token in `auth` above is the only credential.
    withCredentials: true,
    autoConnect: true,
  });

  return socket;
};

/**
 * Subscribe to a server-side room and stay subscribed across reconnects.
 *
 * Identical in contract to the web app's version, and identical in reason: a
 * bare emit only holds until the first disconnect, after which the server has
 * dropped the room membership and the client sits silently receiving nothing.
 * Re-emitting on every `connect` keeps it live.
 *
 * This matters more on a phone than in a browser — backgrounding the app,
 * losing signal, or switching from wifi to cellular all drop the socket, and
 * all three are routine.
 */
export const subscribeWithReconnect = (
  event: string,
  payload: unknown,
  onError?: (message?: string) => void
): (() => void) => {
  const s = getSocket();

  const emit = () => {
    s.emit(event, payload, (ack: { success: boolean; message?: string } | undefined) => {
      if (!ack?.success) onError?.(ack?.message);
    });
  };

  if (s.connected) emit();
  s.on("connect", emit);

  return () => {
    s.off("connect", emit);
  };
};

/**
 * Drop the connection and forget it. Called on logout so the next sign-in
 * builds a fresh socket that authenticates as the new user — reusing the old
 * one would keep it in the previous account's rooms.
 */
export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
