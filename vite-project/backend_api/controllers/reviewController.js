import Review from "../models/Review.js";
import Workshop from "../models/Workshop.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { analyzeSentiment } from "../services/sentimentService.js";
import { BOOKING_STATUS } from "../constants/bookingWorkflow.js";

// Recomputes a workshop's rating and sentiment aggregates from its reviews.
// Always derived, never incremented: an edited or deleted review would drift
// a running total, and the whole point of these fields is that ranking can
// trust them without touching the reviews collection.
export const recalculateWorkshopAggregates = async (workshopId) => {
  const [ratingAgg] = await Review.aggregate([
    { $match: { workshop: workshopId } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  // Only reviews an actual model scored count toward sentiment — "pending"
  // and "unavailable" would otherwise drag every average toward neutral.
  const [sentimentAgg] = await Review.aggregate([
    { $match: { workshop: workshopId, "sentiment.label": { $in: ["positive", "neutral", "negative"] } } },
    {
      $group: {
        _id: null,
        // Weight each review by the model's confidence so an uncertain call
        // moves the aggregate less than a confident one.
        weightedSum: { $sum: { $multiply: ["$sentiment.score", { $ifNull: ["$sentiment.confidence", 1] }] } },
        weightTotal: { $sum: { $ifNull: ["$sentiment.confidence", 1] } },
        positives: { $sum: { $cond: [{ $eq: ["$sentiment.label", "positive"] }, 1, 0] } },
        scoredCount: { $sum: 1 },
      },
    },
  ]);

  await Workshop.findByIdAndUpdate(workshopId, {
    rating: {
      average: ratingAgg?.average ? Number(ratingAgg.average.toFixed(2)) : 0,
      count: ratingAgg?.count ?? 0,
    },
    sentiment: {
      score: sentimentAgg?.weightTotal
        ? Number((sentimentAgg.weightedSum / sentimentAgg.weightTotal).toFixed(4))
        : 0,
      positiveRatio: sentimentAgg?.scoredCount
        ? Number((sentimentAgg.positives / sentimentAgg.scoredCount).toFixed(4))
        : 0,
      scoredCount: sentimentAgg?.scoredCount ?? 0,
    },
  });
};

// A review must be attached to this user's own completed booking. That single
// rule is what makes every review a verified customer, keeps one voice to one
// job, and stops a workshop's rating being brigaded by non-customers.
export const createReview = async (req, res) => {
  try {
    const { serviceRequestId, rating, text } = req.body;
    if (!serviceRequestId || !rating) {
      return res.status(400).json({ success: false, message: "serviceRequestId and rating are required" });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
    }

    const request = await ServiceRequest.findById(serviceRequestId);
    if (!request) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!request.user.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "That booking isn't yours" });
    }
    // "finished", not "completed": a delivery booking is still mid-return in
    // completed, so the customer hasn't had the whole experience yet.
    if (request.status !== BOOKING_STATUS.FINISHED) {
      return res.status(400).json({ success: false, message: "You can only review a completed service" });
    }

    const existing = await Review.findOne({ serviceRequest: serviceRequestId });
    if (existing) {
      return res.status(409).json({ success: false, message: "You've already reviewed this service" });
    }

    // Scored inline so the review is useful immediately. A failure here returns
    // null and leaves the review "pending" rather than rejecting it — the
    // customer's words matter more than the classifier's uptime.
    const sentiment = await analyzeSentiment(text);

    const review = await Review.create({
      workshop: request.workshop,
      user: req.user._id,
      serviceRequest: serviceRequestId,
      rating,
      text: text ?? "",
      ...(sentiment && { sentiment }),
    });

    await recalculateWorkshopAggregates(request.workshop);

    res.status(201).json({ success: true, review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listWorkshopReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ workshop: req.params.id })
      .populate("user", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Drives the "leave a review" prompt: completed bookings of this user that
// don't have a review yet.
export const listReviewableBookings = async (req, res) => {
  try {
    const completed = await ServiceRequest.find({ user: req.user._id, status: BOOKING_STATUS.FINISHED })
      .populate("workshop", "name")
      .sort({ updatedAt: -1 });

    const reviewed = await Review.find({
      serviceRequest: { $in: completed.map((c) => c._id) },
    }).select("serviceRequest");
    const reviewedIds = new Set(reviewed.map((r) => String(r.serviceRequest)));

    res.json({
      success: true,
      bookings: completed.filter((c) => !reviewedIds.has(String(c._id))),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
