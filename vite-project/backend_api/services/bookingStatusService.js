import { assertTransition, BOOKING_STATUS } from "../constants/bookingWorkflow.js";
import { getIO } from "../config/socket.js";

// The only place a booking's status is allowed to change.
//
// Routing every write through here is what makes "no step can be skipped"
// true rather than aspirational: the guard, the timestamp and the realtime
// notification can't be forgotten by a new caller, because there is no other
// way to set the field.
export const moveBookingTo = async (booking, next, { save = true } = {}) => {
  assertTransition(booking, next);

  booking.status = next;
  booking.statusChangedAt = new Date();
  if (save) await booking.save();

  try {
    const io = getIO();
    if (io) {
      // The customer's own view, plus anyone watching this booking (workshop
      // dashboards, the delivery admin's board).
      io.to(`user:${booking.user}`).emit("booking:updated", {
        bookingId: booking._id.toString(),
        status: booking.status,
      });
      io.to("admins").emit("booking:status", {
        bookingId: booking._id.toString(),
        status: booking.status,
        workshop: booking.workshop?.toString?.() ?? booking.workshop,
      });
    }
  } catch {
    // A socket problem must never roll back a legitimate status change.
  }

  return booking;
};

// Whether this booking still has delivery legs ahead of it. Used to pick the
// post-payment branch: a delivery booking goes back out for return delivery,
// a self-drop-off booking heads straight for auto-completion.
export const usesDelivery = (booking) => booking.deliveryRequested === true;

export { BOOKING_STATUS };
