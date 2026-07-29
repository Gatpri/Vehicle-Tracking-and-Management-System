import mongoose from "mongoose";

const SOSAlertSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  message: { type: String, default: "" },
  status: { type: String, enum: ["active", "resolved"], default: "active" },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

const SOSAlert = mongoose.model("SOSAlert", SOSAlertSchema);
export default SOSAlert;
