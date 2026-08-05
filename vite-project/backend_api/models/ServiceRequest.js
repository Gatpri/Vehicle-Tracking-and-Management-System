import mongoose from "mongoose";

const ServiceRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  serviceType: { type: String, required: true },
  description: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
    default: "pending",
  },
  quotedPrice: { type: Number, default: null }, // paisa
  finalPrice: { type: Number, default: null }, // paisa
  isOverpriced: { type: Boolean, default: false },
  overpriceRatio: { type: Number, default: null },
  paymentStatus: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
  scheduledAt: { type: Date, default: null },
  // True when the customer explicitly asked for pickup/drop delivery service
  // rather than bringing the vehicle themselves. Gates whether pickupLocation
  // is required at creation and whether this booking is eligible for a
  // Delivery doc — see createBooking (bookingController.js) and
  // listAssignableBookings (deliveryController.js).
  deliveryRequested: { type: Boolean, default: false },
  // Where the delivery-staff should collect (and later return) the vehicle.
  // Required when deliveryRequested is true; ignored otherwise.
  pickupLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: "" },
  },
  // True once the customer has explicitly requested return delivery — a
  // separate opt-in after the booking is completed+paid. Return delivery is
  // never automatic just because pickup delivery happened, since the
  // customer may want to collect the vehicle themselves. Gates return-leg
  // assignability in listAssignableBookings, the same role deliveryRequested
  // plays for the pickup leg. Free once requested — see deliveryFee below,
  // which already covers both legs of the round trip in one charge.
  returnDeliveryRequested: { type: Boolean, default: false },
  // One combined fee for the whole round trip (pickup + return), computed
  // once — at whichever leg is assigned first — from the workshop <->
  // pickupLocation distance (see deliveryPricingService.js). Bundled into
  // the main booking payment alongside finalPrice; there is no separate
  // return-delivery charge. One staff member is required across both legs
  // (enforced in assignDelivery), so this pays out in full (95%, 5% platform
  // commission) to that one person — see settleBookingPayment/
  // settleDeliveryFee in ledgerService.js.
  deliveryFee: { type: Number, default: null }, // paisa
  // Great-circle workshop <-> pickupLocation distance backing deliveryFee
  // above. Frozen once computed, same reasoning as deliveryFee itself.
  distanceKm: { type: Number, default: null },
}, { timestamps: true });

const ServiceRequest = mongoose.model("ServiceRequest", ServiceRequestSchema);
export default ServiceRequest;
