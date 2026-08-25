/**
 * Removes bookings left stranded in the mid-workflow "completed" state, along
 * with the records that hang off them.
 *
 * "completed" is not the end of the workflow — bookingWorkflow.js transitions
 * it onward to return-delivery and finally to "finished", which is the only
 * terminal state. A booking sitting in "completed" is therefore either mid-
 * flight or, as with the seeded test rows this was written for, stuck: ten
 * identical records for one vehicle on one day, every finalPrice zero.
 *
 * Deleting the booking alone would leave reviews and parts quotes pointing at
 * an id that no longer resolves, so those go too. Notifications reference the
 * booking by URL rather than by ref, hence the string match.
 *
 * Run with --dry (the default) to see the counts, then --commit to delete:
 *
 *   node backend_api/scripts/pruneStuckBookings.js
 *   node backend_api/scripts/pruneStuckBookings.js --commit
 *
 * Restrict to a single vehicle with --vehicle=<id>.
 */
// env.js resolves the .env at the repo root, which is where this project
// keeps it — "dotenv/config" would look in the cwd and find nothing.
import "../env.js";
import mongoose from "mongoose";

const COMMIT = process.argv.includes("--commit");
const vehicleArg = process.argv.find((a) => a.startsWith("--vehicle="));
const VEHICLE_ID = vehicleArg ? vehicleArg.split("=")[1] : null;

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const filter = { status: "completed" };
  if (VEHICLE_ID) filter.vehicle = new mongoose.Types.ObjectId(VEHICLE_ID);

  const bookings = await db.collection("servicerequests").find(filter).toArray();
  const ids = bookings.map((b) => b._id);
  const idStrs = ids.map((i) => i.toString());

  if (ids.length === 0) {
    console.log("Nothing in the 'completed' state. No changes needed.");
    await mongoose.disconnect();
    return;
  }

  // Notifications point at a booking through a link URL, so they cannot be
  // matched with an $in on a ref — each link is checked for the id.
  const notifications = await db.collection("notifications").find({}).toArray();
  const staleNotificationIds = notifications
    .filter((n) => n.link && idStrs.some((s) => n.link.includes(s)))
    .map((n) => n._id);

  const counts = {
    bookings: ids.length,
    reviews: await db.collection("reviews").countDocuments({ serviceRequest: { $in: ids } }),
    partsquotes: await db.collection("partsquotes").countDocuments({ serviceRequest: { $in: ids } }),
    deliveries: await db.collection("deliveries").countDocuments({ booking: { $in: ids } }),
    transactions: await db.collection("transactions").countDocuments({ relatedBooking: { $in: ids } }),
    notifications: staleNotificationIds.length,
  };

  const remaining = await db.collection("servicerequests").countDocuments({ status: "finished" });

  console.log(COMMIT ? "=== DELETING ===" : "=== DRY RUN (pass --commit to apply) ===");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`\n  'finished' bookings kept: ${remaining}`);

  if (!COMMIT) {
    console.log("\nNothing was deleted. Re-run with --commit to apply.");
    await mongoose.disconnect();
    return;
  }

  await db.collection("reviews").deleteMany({ serviceRequest: { $in: ids } });
  await db.collection("partsquotes").deleteMany({ serviceRequest: { $in: ids } });
  await db.collection("deliveries").deleteMany({ booking: { $in: ids } });
  await db.collection("transactions").deleteMany({ relatedBooking: { $in: ids } });
  if (staleNotificationIds.length) {
    await db.collection("notifications").deleteMany({ _id: { $in: staleNotificationIds } });
  }
  await db.collection("servicerequests").deleteMany({ _id: { $in: ids } });

  console.log("\nDone.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
