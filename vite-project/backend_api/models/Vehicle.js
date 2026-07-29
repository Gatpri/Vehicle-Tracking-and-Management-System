import mongoose from "mongoose";

const VehicleSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  plateNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  make: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number },
  color: { type: String },
  vehicleType: { type: String, enum: ["car", "bike", "scooter", "truck", "other"], default: "car" },
  status: { type: String, enum: ["active", "stolen", "inactive"], default: "active" },
  images: { type: [String], default: [] },
}, { timestamps: true });

const Vehicle = mongoose.model("Vehicle", VehicleSchema);
export default Vehicle;
