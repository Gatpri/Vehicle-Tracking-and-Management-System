import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema({
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  // The booking this review is about. Reviews are only accepted against a
  // *completed* request, and one per request — that's what makes every review
  // here a verified customer rather than anonymous noise.
  serviceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceRequest",
    required: true,
    unique: true,
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, default: "", trim: true, maxlength: 2000 },

  // --- Filled in by the sentiment classifier (see services/sentimentService.js).
  // Kept "pending" until a model scores it, so reviews written while the
  // classifier is offline can be backfilled later rather than lost.
  sentiment: {
    label: {
      type: String,
      enum: ["positive", "neutral", "negative", "pending", "unavailable"],
      default: "pending",
      index: true,
    },
    // -1 (most negative) .. +1 (most positive). Null until scored.
    score: { type: Number, default: null },
    // The classifier's own confidence, 0-1 — useful for excluding weak calls
    // from the aggregate.
    confidence: { type: Number, default: null },
    // Which script/language the model detected: "devanagari" | "romanized" |
    // "english". Stored so accuracy can be reported per language.
    language: { type: String, default: "" },
    modelVersion: { type: String, default: "" },
    scoredAt: { type: Date, default: null },
  },
}, { timestamps: true });

// A user's reviews for one workshop, newest first — the workshop detail page's
// main query.
ReviewSchema.index({ workshop: 1, createdAt: -1 });

const Review = mongoose.model("Review", ReviewSchema);
export default Review;
