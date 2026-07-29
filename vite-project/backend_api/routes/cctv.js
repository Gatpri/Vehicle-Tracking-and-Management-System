import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { upload } from "../config/multer.js";
import { scanImage, listSightings } from "../controllers/cctvController.js";

const router = express.Router();

router.post("/cctv/scan", verifyToken, requirePermission("cctv:submit"), upload.single("image"), scanImage);
router.get("/cctv/sightings", verifyToken, requirePermission("cctv:read"), listSightings);

export default router;
