import mongoose from "mongoose";

const SOSAlertSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  message: { type: String, default: "" },
  // "theft" alerts are raised from the breaking-alert overlay when an owner
  // confirms the vehicle a camera spotted really is theirs, and carry the
  // evidence admins need to act on. "manual" is the plain SOS button.
  kind: { type: String, enum: ["manual", "theft"], default: "manual" },
  // What the owner said when shown the detection. "confirmed" means they
  // verified it really is their stolen vehicle, so admins should act now;
  // "not-confirmed" still reaches the queue, because a stolen-flagged plate
  // was detected and somebody should look even if the owner wasn't sure.
  ownerConfirmation: { type: String, enum: ["confirmed", "not-confirmed", null], default: null },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  sighting: { type: mongoose.Schema.Types.ObjectId, ref: "CameraSighting", default: null },
  // Copied at confirmation time rather than looked up later: an admin opening
  // this alert needs the frame as it was, even if the vehicle record is edited
  // or the sighting is purged afterwards.
  // The camera's frame, versus the owner's own reference shots. Admins compare
  // the first against the other two to confirm it really is this vehicle.
  plateImageUrl: { type: String, default: "" },
  vehicleImageUrl: { type: String, default: "" },
  ownerPlateImageUrl: { type: String, default: "" },
  cameraId: { type: String, default: "" },
  // Where the camera saw the vehicle, as distinct from `location`, which is
  // where the owner was when they confirmed. Admins need both.
  sightingLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  // "pending" is for a detection the owner didn't confirm: it still needs an
  // admin's eyes, but it isn't the emergency an "active" alert is.
  status: { type: String, enum: ["active", "pending", "resolved"], default: "active" },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

const SOSAlert = mongoose.model("SOSAlert", SOSAlertSchema);
export default SOSAlert;
