import { registerTrackingHandlers } from "./trackingHandlers.js";
import { registerChatHandlers } from "./chatHandlers.js";
import { registerSosHandlers } from "./sosHandlers.js";
import { registerDeliveryHandlers } from "./deliveryHandlers.js";

// config/socket.js owns the transport-level concerns (JWT auth, room
// auto-join on connect). This registers the domain-specific event handlers
// on every authenticated connection.
export const registerHandlers = (io) => {
  io.on("connection", (socket) => {
    registerTrackingHandlers(socket);
    registerChatHandlers(socket);
    registerSosHandlers(socket);
    registerDeliveryHandlers(socket);
  });
};
