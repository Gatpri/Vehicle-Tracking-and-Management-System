import express from "express";
import { verifyToken, requirePermission, attachUserIfPresent } from "../middleware/auth.js";
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
  submitWorkshopChangeRequest,
  listWorkshopChangeRequests,
  reviewWorkshopChangeRequest,
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
// Change requests. The list is shared: admins see everything pending, a
// workshop-admin sees only their own garage's history (narrowed in the
// controller), so both roles can reach it with the same permission.
router.get("/workshop-change-requests", verifyToken, requirePermission("workshop:request-update"), listWorkshopChangeRequests);
router.post("/workshops/:id/change-requests", verifyToken, requirePermission("workshop:request-update"), submitWorkshopChangeRequest);
router.patch("/workshop-change-requests/:requestId", verifyToken, requirePermission("workshop:review-request"), reviewWorkshopChangeRequest);

router.get("/reviews/pending", verifyToken, listReviewableBookings);
router.post("/reviews", verifyToken, createReview);
// Public, but attaches the caller when signed in: admins get each workshop's
// assigned manager in the response, customers browsing the same endpoint don't.
router.get("/workshops", attachUserIfPresent, listWorkshops);
router.get("/workshops/:id/reviews", listWorkshopReviews);
router.get("/workshops/:id", getWorkshop);
router.post("/workshops", verifyToken, requirePermission("workshop:create"), createWorkshop);
router.patch("/workshops/:id", verifyToken, requirePermission("workshop:update"), updateWorkshop);
// A logo is an image, not a price, and it can't be meaningfully diffed in a
// request — so it stays a direct edit, open to a workshop-admin for their own
// garage (ownership is enforced inside uploadLogo).
router.post("/workshops/:id/logo", verifyToken, requirePermission("workshop:request-update"), upload.single("image"), uploadLogo);
router.delete("/workshops/:id", verifyToken, requirePermission("workshop:delete"), deleteWorkshop);

export default router;
