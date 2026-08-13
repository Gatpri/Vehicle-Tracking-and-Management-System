import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  createBooking,
  listMyBookings,
  listBookings,
  getBooking,
  acceptBooking,
  startBooking,
  requestPayment,
  completeBooking,
  requestPickupDelivery,
  cancelBooking,
  getVehicleServiceHistory,
  getBookingPayment,
} from "../controllers/bookingController.js";

const router = express.Router();

// Static sub-path before any "/:id" route below.
router.get("/vehicles/:vehicleId/service-history", verifyToken, getVehicleServiceHistory);

router.post("/bookings", verifyToken, createBooking);
router.get("/bookings/mine", verifyToken, listMyBookings); // also doubles as service history via ?status=completed
router.get("/bookings", verifyToken, requirePermission("booking:read:any"), listBookings);
router.get("/bookings/:id/payment", verifyToken, getBookingPayment);
router.get("/bookings/:id", verifyToken, getBooking);
router.patch("/bookings/:id/accept", verifyToken, requirePermission("booking:manage"), acceptBooking);
// Step 2 — the customer asks for the pickup leg (delivery bookings only).
router.patch("/bookings/:id/request-delivery", verifyToken, requestPickupDelivery);
// Step 7 — workshop starts the service once the vehicle is on site.
router.patch("/bookings/:id/start", verifyToken, requirePermission("booking:manage"), startBooking);
// Step 9 — workshop closes the estimate and asks for payment.
router.patch("/bookings/:id/request-payment", verifyToken, requirePermission("booking:manage"), requestPayment);
// Signs the finished job off once paid; releases a delivery booking's return leg.
router.patch("/bookings/:id/complete", verifyToken, requirePermission("booking:manage"), completeBooking);
router.patch("/bookings/:id/cancel", verifyToken, cancelBooking);

export default router;
