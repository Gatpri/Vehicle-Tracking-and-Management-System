import Delivery from "../models/Delivery.js";
import ServiceRequest from "../models/ServiceRequest.js";
import DeliveryLocationHistory from "../models/DeliveryLocationHistory.js";
import User from "../models/User.js";
import { canViewDelivery } from "../policies/deliveryAccess.js";
import { hasPermission } from "../policies/permissions.js";
import { getIO } from "../config/socket.js";

// Kept in sync with deliveryController.js's own EN_ROUTE_STATUSES — every
// status where the staff is actually driving and a location push is valid.
const EN_ROUTE_STATUSES = ["en_route_to_pickup", "en_route_to_workshop", "en_route_to_dropoff"];

const canViewAnyStaffLocation = (user) =>
  hasPermission(user.role, "deliverystaff:location:any", user.permissions) ||
  hasPermission(user.role, "delivery:manage", user.permissions);

export const registerDeliveryHandlers = (socket) => {
  // Customer, assigned staff, admin/superadmin, or the managing workshop-admin
  // may subscribe to a delivery leg's live room.
  socket.on("delivery:subscribe", async (deliveryId, ack) => {
    try {
      const delivery = await Delivery.findById(deliveryId);
      if (!delivery) return ack?.({ success: false, message: "Delivery not found" });
      const booking = await ServiceRequest.findById(delivery.booking).select("user");
      if (!booking) return ack?.({ success: false, message: "Booking not found" });

      const allowed = await canViewDelivery(socket.user, delivery, booking);
      if (!allowed) return ack?.({ success: false, message: "Forbidden" });

      socket.join(`booking:${delivery.booking}`);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  // Only the assigned staff member's own socket may push, and only while
  // actively en route — mirrors the REST guard in deliveryController.js.
  socket.on("delivery:push", async ({ deliveryId, lat, lng, speed, heading }, ack) => {
    try {
      const delivery = await Delivery.findById(deliveryId);
      if (!delivery) return ack?.({ success: false, message: "Delivery not found" });
      if (!delivery.staff?.equals(socket.user._id)) return ack?.({ success: false, message: "Forbidden" });
      if (!EN_ROUTE_STATUSES.includes(delivery.status)) {
        return ack?.({ success: false, message: "Not currently en route" });
      }

      const point = await DeliveryLocationHistory.create({
        delivery: delivery._id,
        booking: delivery.booking,
        lat,
        lng,
        speed,
        heading: typeof heading === "number" ? heading : null,
        source: "socket",
      });
      getIO().to(`booking:${delivery.booking}`).emit("delivery:update", point);

      // Mirrors into the staff member's ambient location too, so an
      // actively-en-route delivery keeps the always-on staff-locations view
      // current without a second location loop on the client.
      const recordedAt = new Date();
      await User.findByIdAndUpdate(socket.user._id, { lastKnownLocation: { lat, lng, recordedAt }, lastSeenAt: recordedAt });
      getIO().to("staff:online").emit("staff:location", { staffId: String(socket.user._id), lat, lng, recordedAt });

      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  // Admin/superadmin/delivery-admin join this once to receive every online
  // delivery-staff member's ambient location as it updates. A single shared
  // room rather than one room per staff member, since the use case is "show
  // me everyone currently online" — a list/map view, not a per-person
  // subscribe. delivery-admin's view is narrowed to their own region by the
  // initial REST snapshot (GET /delivery-staff, already region-filtered
  // server-side) rather than at the room level — a known simplification at
  // this project's scale.
  socket.on("staff:subscribe-locations", (_payload, ack) => {
    if (!canViewAnyStaffLocation(socket.user)) return ack?.({ success: false, message: "Forbidden" });
    socket.join("staff:online");
    ack?.({ success: true });
  });

  // Ambient "I'm online, here's roughly where I am" — sent by the staff
  // dashboard on a coarse interval independent of any active delivery leg.
  socket.on("staff:ping-location", async ({ lat, lng }, ack) => {
    if (socket.user.role !== "delivery-staff") return ack?.({ success: false, message: "Forbidden" });
    try {
      const recordedAt = new Date();
      await User.findByIdAndUpdate(socket.user._id, { lastKnownLocation: { lat, lng, recordedAt }, lastSeenAt: recordedAt });
      getIO().to("staff:online").emit("staff:location", { staffId: String(socket.user._id), lat, lng, recordedAt });
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  // Marks a staff member offline immediately rather than waiting for
  // lastSeenAt to go stale, so the live-locations view reflects a closed tab
  // right away.
  socket.on("disconnect", () => {
    if (socket.user?.role === "delivery-staff") {
      getIO().to("staff:online").emit("staff:offline", { staffId: String(socket.user._id) });
    }
  });
};
