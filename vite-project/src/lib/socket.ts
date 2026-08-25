import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// Lazily connects on first use and reuses the same connection everywhere —
// every page that needs live updates just calls getSocket() in a useEffect.
export const getSocket = (): Socket => {
  if (socket) return socket;

  // No URL: connects to the page's own origin, which nginx proxies to the
  // backend at /socket.io — works from any host the browser used to load
  // the page, not just the Docker host itself.
  //
  // No `auth` payload: the session is an httpOnly cookie the page cannot
  // read, and `withCredentials` makes the browser send it on the handshake
  // request, where config/socket.js reads it. That also removes the old
  // stale-token problem on reconnect — the browser always sends whatever
  // cookie is current, so there is nothing to refresh by hand.
  socket = io({
    withCredentials: true,
    autoConnect: true,
  });

  return socket;
};

/**
 * Subscribe to a server-side room and stay subscribed across reconnects.
 *
 * A bare `socket.emit("...:subscribe", id)` only works until the first
 * disconnect — after that the server has dropped the room membership and the
 * client sits silently receiving nothing, which looks exactly like "the
 * feature is broken". Re-emitting on every `connect` keeps it live.
 *
 * Returns a cleanup function that detaches the re-subscribe handler.
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

  // `connect` fires on reconnects, but not if the socket is already up by the
  // time this runs — so cover that case explicitly.
  if (s.connected) emit();
  s.on("connect", emit);

  return () => {
    s.off("connect", emit);
  };
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
