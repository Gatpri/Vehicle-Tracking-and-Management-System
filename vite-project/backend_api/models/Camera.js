import mongoose from "mongoose";

const CameraSchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true, trim: true },
  // "device" cameras only ever exist as a live tile in an open admin
  // browser tab — there's nothing at a fixed network address for the
  // backend to poll, so only "remote" cameras are ever auto-scanned.
  sourceType: { type: String, enum: ["device", "remote"], default: "remote" },
  streamUrl: { type: String, default: "" },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  active: { type: Boolean, default: true },
  // Scans four overlapping tiles of the frame on top of the full-frame pass.
  // Small/distant plates a single pass misses get found, and plates it does
  // find are localized more tightly — on a 640x480 test frame the plate's box
  // confidence went 33% -> 65%. Tiles run at 640px (they're already crops), so
  // the cost is ~1.6x a plain scan, not 5x. Off by default: a camera pointed
  // at one gate gains nothing from it.
  tiledScan: { type: Boolean, default: false },
  pollIntervalSec: { type: Number, default: 15, min: 5 },
  lastPolledAt: { type: Date, default: null },
  lastStatus: { type: String, enum: ["never", "ok", "error"], default: "never" },
  lastError: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const Camera = mongoose.model("Camera", CameraSchema);
export default Camera;
