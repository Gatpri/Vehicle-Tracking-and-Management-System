import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { uploadAudio } from "../config/multer.js";
import {
  getQuote,
  sendWorkshopRevision,
  sendWorkshopReply,
  sendCustomerResponse,
  confirmQuote,
} from "../controllers/quoteController.js";

const router = express.Router();

// Both sides of one booking's quote. Access is decided per-handler by whether
// the caller is the booking's customer or manages its workshop, so no
// permission string applies cleanly here.
//
// The two "send" routes accept an optional `voice` file alongside the JSON
// fields, hence multipart rather than a plain body.
router.get("/bookings/:bookingId/quote", verifyToken, getQuote);
router.post("/bookings/:bookingId/quote/workshop", verifyToken, uploadAudio.single("voice"), sendWorkshopRevision);
router.post("/bookings/:bookingId/quote/reply", verifyToken, uploadAudio.single("voice"), sendWorkshopReply);
router.post("/bookings/:bookingId/quote/customer", verifyToken, uploadAudio.single("voice"), sendCustomerResponse);
// Only the workshop confirms — the customer's acceptance is the offer.
router.post("/bookings/:bookingId/quote/confirm", verifyToken, confirmQuote);

export default router;
