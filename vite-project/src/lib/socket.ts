import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// Lazily connects on first use and reuses the same connection everywhere —
// every page that needs live updates just calls getSocket() in a useEffect.
export const getSocket = (): Socket => {
  if (socket) return socket;

  const token = localStorage.getItem("token");
  socket = io("http://localhost:3000", {
    auth: { token },
    autoConnect: true,
  });
  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
