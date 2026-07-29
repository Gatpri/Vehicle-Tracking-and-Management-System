import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { recordLocation, getLocationHistory, getLatestLocation } from "../controllers/trackingController.js";

const router = express.Router();

router.post("/tracking/:vehicleId/location", verifyToken, recordLocation);
router.get("/tracking/:vehicleId/history", verifyToken, getLocationHistory);
router.get("/tracking/:vehicleId/latest", verifyToken, getLatestLocation);

export default router;
