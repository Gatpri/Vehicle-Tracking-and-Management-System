import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { upload } from "../config/multer.js";
import {
  registerVehicle,
  listMyVehicles,
  listVehicles,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  flagVehicle,
  uploadVehiclePhoto,
  deleteVehiclePhoto,
} from "../controllers/vehicleController.js";

const router = express.Router();

router.post("/vehicles", verifyToken, registerVehicle);
router.get("/vehicles/mine", verifyToken, listMyVehicles);
router.get("/vehicles", verifyToken, requirePermission("vehicle:read:any"), listVehicles);
router.get("/vehicles/:id", verifyToken, getVehicle);
router.patch("/vehicles/:id", verifyToken, updateVehicle);
router.delete("/vehicles/:id", verifyToken, deleteVehicle);
router.post("/vehicles/:id/photos", verifyToken, upload.single("image"), uploadVehiclePhoto);
router.delete("/vehicles/:id/photos", verifyToken, deleteVehiclePhoto);
router.patch("/vehicles/:id/flag", verifyToken, requirePermission("vehicle:flag"), flagVehicle);

export default router;
