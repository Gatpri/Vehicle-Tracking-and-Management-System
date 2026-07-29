import mongoose from "mongoose";

const LocationHistorySchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: { type: Number, default: null },
  recordedAt: { type: Date, default: Date.now },
  // No real GPS hardware exists yet — "source" makes clear this point was
  // client-pushed (simulated/manual/socket) rather than a verified device feed.
  source: { type: String, enum: ["simulated", "manual", "socket"], default: "manual" },
});

LocationHistorySchema.index({ vehicle: 1, recordedAt: -1 });
// Keep history bounded for a capstone-scale deployment — 90 days.
LocationHistorySchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const LocationHistory = mongoose.model("LocationHistory", LocationHistorySchema);
export default LocationHistory;
