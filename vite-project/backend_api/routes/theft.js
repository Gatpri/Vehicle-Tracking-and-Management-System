import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { createReport, listMyReports, getHeatmap, listReports, updateReport } from "../controllers/theftController.js";

const router = express.Router();

// Static sub-paths before "/:id".
router.get("/theft-reports/mine", verifyToken, listMyReports);
router.get("/theft-reports/heatmap", getHeatmap); // public, unauthenticated
router.post("/theft-reports", verifyToken, createReport);
router.get("/theft-reports", verifyToken, requirePermission("theft:manage"), listReports);
router.patch("/theft-reports/:id", verifyToken, requirePermission("theft:manage"), updateReport);

export default router;
