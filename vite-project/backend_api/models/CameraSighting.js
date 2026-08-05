import mongoose from "mongoose";

const CameraSightingSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  recognizedPlateText: { type: String, default: "" },
  normalizedPlateText: { type: String, default: "", index: true },
  confidence: { type: Number, default: 0 },
  // Whether stage 1 localized a plate in the frame, and how confident it was —
  // separate from `confidence` above, which is the character-reading
  // confidence. False here does not mean no text: the reader falls back to the
  // whole image, which is what an already-cropped plate upload needs.
  plateDetected: { type: Boolean, default: false },
  plateDetectionConfidence: { type: Number, default: 0 },
  matchedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  matchedStolen: { type: Boolean, default: false },
  // Only meaningful on a stolen match. The owner's alert is raised over a
  // socket, which is fire-and-forget — an owner who wasn't online at the moment
  // of detection would never learn of it. Keeping the response state here means
  // the alert is a durable to-do: it's re-shown on next login until answered.
  ownerResponse: {
    type: String,
    enum: ["pending", "confirmed", "rejected"],
    default: "pending",
  },
  ownerRespondedAt: { type: Date, default: null },
  // Stands in for a real camera's identity since no physical CCTV hardware
  // is connected — a fixed id lets scans still be grouped/filterable per "camera".
  cameraId: { type: String, default: "manual-upload" },
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
}, { timestamps: true });

const CameraSighting = mongoose.model("CameraSighting", CameraSightingSchema);
export default CameraSighting;
