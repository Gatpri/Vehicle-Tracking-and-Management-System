// Backfills the new `region` field from the existing `area` field on
// Workshop and delivery-staff User documents (region = area when there's no
// finer subdivision recorded yet), and marks pre-existing bookings that
// already carry a pickupLocation as deliveryRequested — otherwise they'd
// silently vanish from /deliveries/assignable once that gate ships.
//
//   node backend_api/scripts/backfillRegion.js
//
// Safe to re-run: every update is scoped to documents that still need it.
import "../env.js";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import Workshop from "../models/Workshop.js";
import User from "../models/User.js";
import ServiceRequest from "../models/ServiceRequest.js";

await connectDB();

const workshopResult = await Workshop.updateMany(
  { area: { $ne: "" }, region: "" },
  [{ $set: { region: "$area" } }],
  { updatePipeline: true }
);
console.log(`Workshops: region backfilled for ${workshopResult.modifiedCount} document(s).`);

const staffResult = await User.updateMany(
  { role: "delivery-staff", area: { $ne: "" }, region: "" },
  [{ $set: { region: "$area" } }],
  { updatePipeline: true }
);
console.log(`Delivery-staff: region backfilled for ${staffResult.modifiedCount} document(s).`);

const bookingResult = await ServiceRequest.updateMany(
  { "pickupLocation.lat": { $ne: null }, deliveryRequested: false },
  { deliveryRequested: true }
);
console.log(`Bookings: deliveryRequested set for ${bookingResult.modifiedCount} document(s) with an existing pickupLocation.`);

await mongoose.disconnect();
