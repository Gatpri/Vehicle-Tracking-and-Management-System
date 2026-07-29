import mongoose from "mongoose";

const ServiceRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  serviceType: { type: String, required: true },
  description: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
    default: "pending",
  },
  quotedPrice: { type: Number, default: null }, // paisa
  finalPrice: { type: Number, default: null }, // paisa
  isOverpriced: { type: Boolean, default: false },
  overpriceRatio: { type: Number, default: null },
  paymentStatus: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
  scheduledAt: { type: Date, default: null },
}, { timestamps: true });

const ServiceRequest = mongoose.model("ServiceRequest", ServiceRequestSchema);
export default ServiceRequest;
