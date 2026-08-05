import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { listMyNotifications, markRead, markAllRead } from "../controllers/notificationController.js";

const router = express.Router();

// All own-data: every handler scopes by req.user, so no permission is needed
// beyond being signed in.
router.get("/notifications", verifyToken, listMyNotifications);
router.patch("/notifications/read-all", verifyToken, markAllRead);
router.patch("/notifications/:id/read", verifyToken, markRead);

export default router;
