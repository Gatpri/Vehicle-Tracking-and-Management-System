import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { listCameras, createCamera, updateCamera, deleteCamera } from "../controllers/cameraController.js";

const router = express.Router();

router.get("/cameras", verifyToken, requirePermission("cctv:read"), listCameras);
router.post("/cameras", verifyToken, requirePermission("cctv:manage"), createCamera);
router.patch("/cameras/:id", verifyToken, requirePermission("cctv:manage"), updateCamera);
router.delete("/cameras/:id", verifyToken, requirePermission("cctv:manage"), deleteCamera);

export default router;
