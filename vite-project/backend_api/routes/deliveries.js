import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  listAssignableBookings,
  listStaffByArea,
  assignDelivery,
  reassignDelivery,
  listMyDeliveries,
  listDeliveries,
  getDeliveriesForBooking,
  getDelivery,
  updateDeliveryStatus,
  recordDeliveryLocation,
  getDeliveryLocationHistory,
  getDeliveryLatestLocation,
} from "../controllers/deliveryController.js";
import {
  createDeliveryStaffReview,
  listReviewableDeliveries,
  listStaffReviews,
} from "../controllers/deliveryReviewController.js";

const router = express.Router();

// Static sub-paths before any "/:id" route below.
router.get("/deliveries/assignable", verifyToken, requirePermission("delivery:manage"), listAssignableBookings);
router.get("/deliveries/staff", verifyToken, requirePermission("delivery:manage"), listStaffByArea);
router.get("/deliveries/mine", verifyToken, listMyDeliveries);
router.get("/deliveries/reviewable", verifyToken, listReviewableDeliveries);
router.post("/deliveries/reviews", verifyToken, createDeliveryStaffReview);
router.get("/deliveries/staff/:staffId/reviews", verifyToken, listStaffReviews);
router.get("/deliveries/booking/:bookingId", verifyToken, getDeliveriesForBooking);

router.post("/deliveries", verifyToken, requirePermission("delivery:manage"), assignDelivery);
router.get("/deliveries", verifyToken, listDeliveries);
router.get("/deliveries/:id", verifyToken, getDelivery);
router.patch("/deliveries/:id/reassign", verifyToken, requirePermission("delivery:manage"), reassignDelivery);
router.patch("/deliveries/:id/status", verifyToken, updateDeliveryStatus);

router.post("/deliveries/:id/location", verifyToken, recordDeliveryLocation);
router.get("/deliveries/:id/history", verifyToken, getDeliveryLocationHistory);
router.get("/deliveries/:id/latest", verifyToken, getDeliveryLatestLocation);

export default router;
