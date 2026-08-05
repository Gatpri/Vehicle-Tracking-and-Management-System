// One-off: populate Vehicle.normalizedPlate on records created before that
// field existed. Camera matching compares against it, so any vehicle without
// one can never be matched by a CCTV read.
//
//   node backend_api/scripts/backfillNormalizedPlates.js
import "../env.js";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import Vehicle from "../models/Vehicle.js";
import { normalizePlate } from "../utils/plateMatch.js";

await connectDB();

const vehicles = await Vehicle.find({
  $or: [{ normalizedPlate: { $exists: false } }, { normalizedPlate: "" }, { normalizedPlate: null }],
});

console.log(`${vehicles.length} vehicle(s) need a normalized plate.`);
for (const vehicle of vehicles) {
  vehicle.normalizedPlate = normalizePlate(vehicle.plateNumber);
  await vehicle.save();
  console.log(`  "${vehicle.plateNumber}" -> "${vehicle.normalizedPlate}"`);
}

console.log("Done.");
await mongoose.disconnect();
