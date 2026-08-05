import mongoose from "mongoose";

const PointSchema = {
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  address: { type: String, default: "" },
};

const DeliverySchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  // "pickup": customer -> workshop (before servicing).
  // "return": workshop -> customer (after servicing + payment).
  leg: { type: String, enum: ["pickup", "return"], required: true },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Copied from workshop.area at assignment time, for filtering/history.
  area: { type: String, default: "" },
  // Shared enum across both legs; the controller enforces which subset is
  // legal for which leg (pickup: en_route_to_pickup/picked_up/
  // en_route_to_workshop/at_workshop, return: en_route_to_dropoff/delivered).
  status: {
    type: String,
    enum: [
      "unassigned",
      "assigned",
      "en_route_to_pickup",
      "picked_up",
      "en_route_to_workshop",
      "at_workshop",
      "en_route_to_dropoff",
      "delivered",
      "cancelled",
    ],
    default: "unassigned",
  },
  // Always the customer's point, whichever leg it's used for. Frozen at
  // assignment time from booking.pickupLocation so a Delivery doc stays
  // self-contained even if the customer edits their address later.
  customerLocation: PointSchema,
  assignedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  // The one combined round-trip fee (ServiceRequest.deliveryFee) is shared
  // across both legs, but each leg's *earning* is credited independently —
  // this marks when THIS leg's share was posted to its staff member's
  // wallet, guarding against posting the same leg's share twice. See
  // settleBookingPayment/settleDeliveryFee in ledgerService.js.
  feeSettledAt: { type: Date, default: null },
}, { timestamps: true });

// At most one pickup-leg and one return-leg document per booking.
DeliverySchema.index({ booking: 1, leg: 1 }, { unique: true });
DeliverySchema.index({ staff: 1, status: 1 });

const Delivery = mongoose.model("Delivery", DeliverySchema);
export default Delivery;
