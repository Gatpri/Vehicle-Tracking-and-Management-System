import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// Lazily connects on first use and reuses the same connection everywhere —
// every page that needs live updates just calls getSocket() in a useEffect.
export const getSocket = (): Socket => {
  if (socket) return socket;

  // No URL: connects to the page's own origin, which nginx proxies to the
  // backend at /socket.io — works from any host the browser used to load
  // the page, not just the Docker host itself.
  const token = localStorage.getItem("token");
  socket = io({
    auth: { token },
    autoConnect: true,
  });
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
