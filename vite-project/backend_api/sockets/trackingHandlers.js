import Vehicle from "../models/Vehicle.js";
import LocationHistory from "../models/LocationHistory.js";
import { getIO } from "../config/socket.js";

export const registerTrackingHandlers = (socket) => {
  // Owner or an admin can subscribe to a vehicle's live location room.
  socket.on("tracking:subscribe", async (vehicleId, ack) => {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return ack?.({ success: false, message: "Vehicle not found" });

      const isOwner = vehicle.owner.equals(socket.user._id);
      const isAdmin = socket.user.role === "admin" || socket.user.role === "superadmin";
      if (!isOwner && !isAdmin) return ack?.({ success: false, message: "Forbidden" });

      socket.join(`vehicle:${vehicleId}`);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  // Only the owner's own client can push a live point (e.g. a phone app);
  // persists the same way the REST fallback in routes/tracking.js does.
  socket.on("tracking:push", async ({ vehicleId, lat, lng, speed }, ack) => {
    try {
      const vehicle = await Vehicle.findById(vehicleId);
      if (!vehicle) return ack?.({ success: false, message: "Vehicle not found" });
      if (!vehicle.owner.equals(socket.user._id)) return ack?.({ success: false, message: "Forbidden" });

      const point = await LocationHistory.create({ vehicle: vehicleId, lat, lng, speed, source: "socket" });
      getIO().to(`vehicle:${vehicleId}`).emit("tracking:update", point);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });
};
