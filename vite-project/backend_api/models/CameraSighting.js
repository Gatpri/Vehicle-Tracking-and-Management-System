import mongoose from "mongoose";

const CameraSightingSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  recognizedPlateText: { type: String, default: "" },
  normalizedPlateText: { type: String, default: "", index: true },
  confidence: { type: Number, default: 0 },
  matchedVehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  matchedStolen: { type: Boolean, default: false },
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
