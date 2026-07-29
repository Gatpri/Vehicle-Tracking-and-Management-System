import mongoose from "mongoose";

const TheftReportSchema = new mongoose.Schema({
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  description: { type: String, default: "" },
  status: { type: String, enum: ["open", "recovered", "closed"], default: "open" },
}, { timestamps: true });

const TheftReport = mongoose.model("TheftReport", TheftReportSchema);
export default TheftReport;
