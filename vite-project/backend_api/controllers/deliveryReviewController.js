import DeliveryStaffReview from "../models/DeliveryStaffReview.js";
import Delivery from "../models/Delivery.js";
import ServiceRequest from "../models/ServiceRequest.js";
import User from "../models/User.js";
import { analyzeSentiment } from "../services/sentimentService.js";

const REVIEWABLE_STATUS_BY_LEG = { pickup: "at_workshop", return: "delivered" };

// Always fully recomputed — same discipline as recalculateWorkshopAggregates.
export const recalculateStaffAggregates = async (staffId) => {
  const [ratingAgg] = await DeliveryStaffReview.aggregate([
    { $match: { staff: staffId } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  // Calculate sentiment aggregates for delivery staff reviews
  const [sentimentAgg] = await DeliveryStaffReview.aggregate([
    { $match: { staff: staffId, "sentiment.label": { $in: ["positive", "neutral", "negative"] } } },
    {
      $group: {
        _id: null,
        weightedSum: { $sum: { $multiply: ["$sentiment.score", { $ifNull: ["$sentiment.confidence", 1] }] } },
        weightTotal: { $sum: { $ifNull: ["$sentiment.confidence", 1] } },
        positives: { $sum: { $cond: [{ $eq: ["$sentiment.label", "positive"] }, 1, 0] } },
        scoredCount: { $sum: 1 },
      },
    },
  ]);

  await User.findByIdAndUpdate(staffId, {
    deliveryRating: {
      average: ratingAgg?.average ? Number(ratingAgg.average.toFixed(2)) : 0,
      count: ratingAgg?.count ?? 0,
    },
    deliverySentiment: {
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

// A review must be attached to the reviewer's own booking, and the leg must
// have actually reached its terminal state — mirrors reviewController.js's
// "verified customer" rule, just keyed to a Delivery leg instead of a booking.
export const createDeliveryStaffReview = async (req, res) => {
  try {
    const { deliveryId, rating, text } = req.body;
    if (!deliveryId || !rating) {
      return res.status(400).json({ success: false, message: "deliveryId and rating are required" });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
    }

    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    if (!delivery.staff) return res.status(400).json({ success: false, message: "This leg has no assigned staff" });

    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    if (!booking || !booking.user.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "That delivery isn't yours to review" });
    }
    if (delivery.status !== REVIEWABLE_STATUS_BY_LEG[delivery.leg]) {
      return res.status(400).json({
        success: false,
        message: `You can only review a ${delivery.leg} leg once it's ${REVIEWABLE_STATUS_BY_LEG[delivery.leg]}`,
      });
    }

    const existing = await DeliveryStaffReview.findOne({ delivery: deliveryId });
    if (existing) return res.status(409).json({ success: false, message: "You've already reviewed this leg" });

    // Analyze sentiment for the review text
    const sentiment = await analyzeSentiment(text);

    const review = await DeliveryStaffReview.create({
      staff: delivery.staff,
      user: req.user._id,
      booking: delivery.booking,
      delivery: deliveryId,
      rating,
      text: text ?? "",
      ...(sentiment && { sentiment }),
    });

    await recalculateStaffAggregates(delivery.staff);

    res.status(201).json({ success: true, review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Drives the "leave a review" prompt: this customer's legs that are at their
// terminal state and don't have a review yet.
export const listReviewableDeliveries = async (req, res) => {
  try {
    const bookingFilter = { user: req.user._id };
    if (req.query.bookingId) bookingFilter._id = req.query.bookingId;

    const bookings = await ServiceRequest.find(bookingFilter).select("_id");
    const deliveries = await Delivery.find({
      booking: { $in: bookings.map((b) => b._id) },
      staff: { $ne: null },
      $or: [
        { leg: "pickup", status: "at_workshop" },
        { leg: "return", status: "delivered" },
      ],
    }).populate("staff", "firstname lastname");

    const reviewed = await DeliveryStaffReview.find({ delivery: { $in: deliveries.map((d) => d._id) } }).select("delivery");
    const reviewedIds = new Set(reviewed.map((r) => String(r.delivery)));

    res.json({ success: true, deliveries: deliveries.filter((d) => !reviewedIds.has(String(d._id))) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listStaffReviews = async (req, res) => {
  try {
    const reviews = await DeliveryStaffReview.find({ staff: req.params.staffId })
      .populate("user", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
