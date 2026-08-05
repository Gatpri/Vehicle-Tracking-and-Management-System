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
}, { timestamps: true });

// A staff member's reviews, newest first — the staff-detail view's main query.
DeliveryStaffReviewSchema.index({ staff: 1, createdAt: -1 });

const DeliveryStaffReview = mongoose.model("DeliveryStaffReview", DeliveryStaffReviewSchema);
export default DeliveryStaffReview;
