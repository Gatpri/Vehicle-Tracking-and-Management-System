import mongoose from "mongoose";
import { normalizePlate } from "../utils/plateMatch.js";

const VehicleSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // As the owner typed it, e.g. "GA 19 PA 4630" — this is what gets displayed.
  plateNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  // The same plate with spaces and punctuation stripped ("GA19PA4630"). CCTV
  // reads are normalized the same way, so this is the only field a camera
  // match can safely compare against: a reader emits "GA 19 Pa 4630" with its
  // own spacing, which would never equal the owner's typed spacing.
  normalizedPlate: { type: String, index: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number },
  color: { type: String },
  vehicleType: { type: String, enum: ["car", "bike", "scooter", "truck", "other"], default: "car" },
  status: { type: String, enum: ["active", "stolen", "inactive"], default: "active" },
  // Photos of the vehicle itself. images[0] is treated as the primary shot —
  // it's what an owner sees next to a camera frame in the theft alert, and
  // what admins get in the SOS evidence panel.
  images: { type: [String], default: [] },
  // A close-up of the number plate, kept apart from the vehicle photos: it's
  // the reference an admin compares a camera's plate read against, so it needs
  // to be addressable on its own rather than buried in the gallery.
  plateImageUrl: { type: String, default: "" },
}, { timestamps: true });

// Keep the normalized form in lockstep with the typed one, so no caller has to
// remember to set it. Note this runs on save() but not on findOneAndUpdate —
// update paths that touch plateNumber must go through a document save.
// Mongoose 9 hooks are promise-based — taking a `next` parameter here would
// have it called with undefined.
VehicleSchema.pre("save", function setNormalizedPlate() {
  if (this.isModified("plateNumber") || !this.normalizedPlate) {
    this.normalizedPlate = normalizePlate(this.plateNumber);
  }
});

const Vehicle = mongoose.model("Vehicle", VehicleSchema);
export default Vehicle;
