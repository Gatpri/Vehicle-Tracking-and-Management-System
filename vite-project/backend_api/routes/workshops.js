import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import {
  listWorkshops,
  recommendWorkshops,
  getWorkshop,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  assignManager,
  getMyWorkshop,
  uploadLogo,
} from "../controllers/workshopController.js";
import { upload } from "../config/multer.js";
import {
  createReview,
  listWorkshopReviews,
  listReviewableBookings,
} from "../controllers/reviewController.js";

const router = express.Router();

// Static sub-paths before "/:id" — same discipline as protectedRoutes.js needs.
router.get("/workshops/recommend", recommendWorkshops);
router.get("/workshops/mine", verifyToken, getMyWorkshop);
// Assigning a manager is a platform-administration act, not a workshop edit —
// requirePermission("workshop:create") keeps it to admin/superadmin, since
// workshop-admin deliberately lacks that permission.
router.patch("/workshops/:id/manager", verifyToken, requirePermission("workshop:create"), assignManager);
router.get("/reviews/pending", verifyToken, listReviewableBookings);
router.post("/reviews", verifyToken, createReview);
router.get("/workshops", listWorkshops);
router.get("/workshops/:id/reviews", listWorkshopReviews);
router.get("/workshops/:id", getWorkshop);
router.post("/workshops", verifyToken, requirePermission("workshop:create"), createWorkshop);
router.patch("/workshops/:id", verifyToken, requirePermission("workshop:update"), updateWorkshop);
router.post("/workshops/:id/logo", verifyToken, requirePermission("workshop:update"), upload.single("image"), uploadLogo);
router.delete("/workshops/:id", verifyToken, requirePermission("workshop:delete"), deleteWorkshop);

export default router;
