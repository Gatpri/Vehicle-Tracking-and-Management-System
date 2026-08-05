import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  createBooking,
  listMyBookings,
  listBookings,
  getBooking,
  acceptBooking,
  startBooking,
  completeBooking,
  cancelBooking,
  getVehicleServiceHistory,
  getBookingPayment,
  requestReturnDelivery,
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
router.patch("/bookings/:id/start", verifyToken, requirePermission("booking:manage"), startBooking);
router.patch("/bookings/:id/complete", verifyToken, requirePermission("booking:manage"), completeBooking);
router.patch("/bookings/:id/cancel", verifyToken, cancelBooking);
router.patch("/bookings/:id/request-return-delivery", verifyToken, requestReturnDelivery);

export default router;
