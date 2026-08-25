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
  //
  // Kept as a single string for backwards compatibility: CCTV matching, the
  // SOS evidence panel and the web detail page all read this field directly.
  // It mirrors plateImages[0], maintained by the pre-save hook below.
  plateImageUrl: { type: String, default: "" },
  // Plate shots by angle. A plate is front and back, and the two do not always
  // read the same — a rear plate can be the only one a camera catches — so
  // both are worth holding rather than overwriting one with the other.
  plateImages: {
    type: [{
      url: { type: String, required: true },
      angle: { type: String, enum: ["front", "back"], required: true },
      _id: false,
    }],
    default: [],
  },
  // Vehicle shots by angle, for identifying a car from any side in a camera
  // frame. Same reasoning as the plate: one photo per angle, replaced rather
  // than appended, so the set stays meaningful instead of becoming a pile.
  vehicleImages: {
    type: [{
      url: { type: String, required: true },
      angle: { type: String, enum: ["front", "back", "left", "right"], required: true },
      _id: false,
    }],
    default: [],
  },
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

// plateImageUrl predates plateImages and is still what CCTV matching, the SOS
// evidence panel and the web detail page read. Mirroring the front shot (or
// whatever is left) into it keeps those working untouched, rather than making
// every consumer learn about the new array.
VehicleSchema.pre("save", function syncPrimaryPlateImage() {
  if (!this.isModified("plateImages")) return;
  const front = this.plateImages.find((p) => p.angle === "front");
  this.plateImageUrl = (front ?? this.plateImages[0])?.url ?? "";
});

const Vehicle = mongoose.model("Vehicle", VehicleSchema);
export default Vehicle;
