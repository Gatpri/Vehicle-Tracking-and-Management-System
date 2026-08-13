import mongoose from "mongoose";

const DeliveryStaffReviewSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", required: true, index: true },
  // One review per completed leg — a booking can have two different staff
  // across its two legs, so per-leg is the only granularity that attributes
  // a review to the right person.
  delivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Delivery",
    required: true,
    unique: true,
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  text: { type: String, default: "", trim: true, maxlength: 2000 },

  // --- Filled in by the sentiment classifier (see services/sentimentService.js).
  // Added for consistency with Review model and to enable sentiment analysis
  // of delivery staff feedback.
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

// A staff member's reviews, newest first — the staff-detail view's main query.
DeliveryStaffReviewSchema.index({ staff: 1, createdAt: -1 });

const DeliveryStaffReview = mongoose.model("DeliveryStaffReview", DeliveryStaffReviewSchema);
export default DeliveryStaffReview;
