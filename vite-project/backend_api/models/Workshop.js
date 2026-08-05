import mongoose from "mongoose";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../constants/workshopOptions.js";

const WorkshopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  address: { type: String, default: "" },
  // Specific locality (e.g. "Bharatpur", "Tandi") — display/filtering only.
  area: { type: String, default: "", index: true },
  // Broader grouping above area (e.g. "Chitwan" contains "Bharatpur", "Tandi").
  // May equal `area` when there's no finer subdivision. Delivery-staff
  // assignment matching uses `region`, not `area` — see assignDelivery in
  // deliveryController.js.
  region: { type: String, default: "", index: true },
  servicesOffered: [{
    serviceType: { type: String, required: true },
    basePrice: { type: Number, required: true }, // paisa
    _id: false,
  }],
  // Brands this workshop has declared experience with, and the bike styles it
  // handles. Empty means "unspecified", not "all" — see constants/workshopOptions.js.
  brandsSupported: { type: [String], enum: VEHICLE_BRANDS, default: [], index: true },
  bikeTypes: { type: [String], enum: BIKE_TYPES, default: [], index: true },

  // Recomputed from Review documents whenever one is written — never edited by
  // hand and never derived at query time.
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  // Aggregate of the sentiment classifier's output across this workshop's
  // reviews. `score` is the confidence-weighted mean in -1..+1; `positiveRatio`
  // is the share of scored reviews that came back positive.
  sentiment: {
    score: { type: Number, default: 0 },
    positiveRatio: { type: Number, default: 0 },
    // How many reviews actually carry a sentiment result. Distinct from
    // rating.count: reviews with no text, or written while the classifier was
    // offline, are rated but unscored.
    scoredCount: { type: Number, default: 0 },
  },
  contactPhone: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
  images: { type: [String], default: [] },
  // Shown on listings and the detail page so a garage is recognisable at a
  // glance rather than being one more name in a list.
  logoUrl: { type: String, default: "" },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
}, { timestamps: true });

const Workshop = mongoose.model("Workshop", WorkshopSchema);
export default Workshop;
