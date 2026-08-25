import express from "express";
import { verifyToken, requirePermission } from "../middleware/auth.js";
import { hasPermission } from "../policies/permissions.js";
import {
  listDeliveryStaff,
  getDeliveryStaffDetail,
  createDeliveryStaff,
  deleteDeliveryStaff,
} from "../controllers/deliveryStaffController.js";

const router = express.Router();

// delivery-admin reaches this via deliverystaff:manage (region-scoped);
// admin/superadmin reach it via their unscoped delivery:manage — broader by
// definition, so accepted as an alternate gate rather than also granting
// deliverystaff:manage to roles that already have something stronger.
const canManageStaff = (req, res, next) => {
  const ok =
    hasPermission(req.user.role, "deliverystaff:manage", req.user.permissions) ||
    hasPermission(req.user.role, "delivery:manage", req.user.permissions);
  if (!ok) return res.status(403).json({ success: false, message: "Forbidden" });
  next();
};

router.get("/delivery-staff", verifyToken, canManageStaff, listDeliveryStaff);
router.get("/delivery-staff/:id", verifyToken, canManageStaff, getDeliveryStaffDetail);

// Deliberately NOT user:create — that permission mints ordinary customers and
// is held by roles with no business staffing a region. The region narrowing
// that actually constrains a delivery-admin lives in the controller, since a
// permission alone cannot express "only in your own region".
router.post("/delivery-staff", verifyToken, requirePermission("deliverystaff:create"), createDeliveryStaff);

router.delete("/delivery-staff/:id", verifyToken, requirePermission("deliverystaff:delete"), deleteDeliveryStaff);

export default router;
