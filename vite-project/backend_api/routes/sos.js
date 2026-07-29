import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { createAlert, listMyAlerts, listAlerts, resolveAlert } from "../controllers/sosController.js";

const router = express.Router();

router.post("/sos", verifyToken, createAlert);
router.get("/sos/mine", verifyToken, listMyAlerts);
router.get("/sos", verifyToken, requirePermission("sos:read:any"), listAlerts);
router.patch("/sos/:id/resolve", verifyToken, requirePermission("sos:resolve"), resolveAlert);

export default router;
