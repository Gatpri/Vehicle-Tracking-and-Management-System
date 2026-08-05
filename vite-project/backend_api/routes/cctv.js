import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { upload } from "../config/multer.js";
import {
  scanImage,
  listSightings,
  detectPreview,
  detectCameraPreview,
  listMyTheftAlerts,
  respondToTheftAlert,
} from "../controllers/cctvController.js";

const router = express.Router();

router.post("/cctv/scan", verifyToken, requirePermission("cctv:submit"), upload.single("image"), scanImage);
router.post("/cctv/detect-preview", verifyToken, requirePermission("cctv:submit"), upload.single("image"), detectPreview);
// Remote cameras: the server fetches the frame itself, so no image is uploaded.
router.post("/cctv/cameras/:id/detect-preview", verifyToken, requirePermission("cctv:submit"), detectCameraPreview);
// Owner-facing: these are about *your own* vehicles, so they need no CCTV
// permission — ownership is enforced inside the controller.
router.get("/cctv/my-theft-alerts", verifyToken, listMyTheftAlerts);
router.post("/cctv/theft-alerts/:id/respond", verifyToken, respondToTheftAlert);
router.get("/cctv/sightings", verifyToken, requirePermission("cctv:read"), listSightings);

export default router;
