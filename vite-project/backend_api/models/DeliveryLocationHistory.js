import mongoose from "mongoose";

const DeliveryLocationHistorySchema = new mongoose.Schema({
  delivery: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery", required: true },
  // Denormalized for convenient booking:<id> room queries.
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: { type: Number, default: null },
  // Compass heading in degrees (0-360, 0 = true north), from the staff's
  // device orientation sensor. Optional: only sent when the browser supports
  // DeviceOrientationEvent and (on iOS) permission was granted. Distinct from
  // any travel-direction bearing a viewer derives from consecutive points —
  // this reflects which way the device is physically facing right now, even
  // while stationary.
  heading: { type: Number, default: null },
  recordedAt: { type: Date, default: Date.now },
  source: { type: String, enum: ["manual", "socket"], default: "socket" },
});

DeliveryLocationHistorySchema.index({ delivery: 1, recordedAt: -1 });
// Delivery legs are hours-long, not weeks-long — a much shorter TTL than
// vehicle tracking's 90 days is enough for any post-hoc review.
DeliveryLocationHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

const DeliveryLocationHistory = mongoose.model("DeliveryLocationHistory", DeliveryLocationHistorySchema);
export default DeliveryLocationHistory;
