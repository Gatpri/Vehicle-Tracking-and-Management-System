import mongoose from "mongoose";

const WorkshopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  address: { type: String, default: "" },
  servicesOffered: [{
    serviceType: { type: String, required: true },
    basePrice: { type: Number, required: true }, // paisa
    _id: false,
  }],
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  contactPhone: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
  images: { type: [String], default: [] },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
}, { timestamps: true });

const Workshop = mongoose.model("Workshop", WorkshopSchema);
export default Workshop;
