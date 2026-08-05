// Scores every review that has no sentiment yet, then recomputes each affected
// workshop's aggregate.
//
// Run this once your classifier is serving POST /sentiment (see
// services/sentimentService.js for the contract). Reviews written while the
// model was offline are stored with label "pending" precisely so they can be
// picked up here rather than being lost.
//
//   node backend_api/scripts/backfillSentiment.js
//
// Safe to re-run: it only touches reviews that are still pending/unavailable,
// so an interrupted run resumes where it left off.
import "../env.js";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import Review from "../models/Review.js";
import { analyzeSentiment, isSentimentConfigured } from "../services/sentimentService.js";
import { recalculateWorkshopAggregates } from "../controllers/reviewController.js";

await connectDB();

if (!(await isSentimentConfigured())) {
  console.error(
    "Sentiment service unreachable. Start your classifier first, or set\n"
    + "SENTIMENT_SERVICE_URL if it isn't on http://127.0.0.1:8000."
  );
  await mongoose.disconnect();
  process.exit(1);
}

const pending = await Review.find({
  "sentiment.label": { $in: ["pending", "unavailable"] },
  text: { $ne: "" },
});

console.log(`${pending.length} review(s) to score.`);

const touchedWorkshops = new Set();
let scored = 0;
let failed = 0;

for (const review of pending) {
  const sentiment = await analyzeSentiment(review.text);
  if (!sentiment) {
    // Mark it so a persistently unscoreable review doesn't stall every future
    // run; it stays out of aggregates either way.
    review.sentiment.label = "unavailable";
    await review.save();
    failed += 1;
    continue;
  }

  review.sentiment = sentiment;
  await review.save();
  touchedWorkshops.add(String(review.workshop));
  scored += 1;
  console.log(`  ${sentiment.label.padEnd(8)} (${sentiment.language || "?"}) ${review.text.slice(0, 60)}`);
}

for (const workshopId of touchedWorkshops) {
  await recalculateWorkshopAggregates(new mongoose.Types.ObjectId(workshopId));
}

console.log(`\nScored ${scored}, failed ${failed}, updated ${touchedWorkshops.size} workshop aggregate(s).`);
await mongoose.disconnect();
