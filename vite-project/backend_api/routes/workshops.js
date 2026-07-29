import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  listWorkshops,
  recommendWorkshops,
  getWorkshop,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
} from "../controllers/workshopController.js";

const router = express.Router();

// Static sub-paths before "/:id" — same discipline as protectedRoutes.js needs.
router.get("/workshops/recommend", recommendWorkshops);
router.get("/workshops", listWorkshops);
router.get("/workshops/:id", getWorkshop);
router.post("/workshops", verifyToken, requirePermission("workshop:create"), createWorkshop);
router.patch("/workshops/:id", verifyToken, requirePermission("workshop:update"), updateWorkshop);
router.delete("/workshops/:id", verifyToken, requirePermission("workshop:delete"), deleteWorkshop);

export default router;
