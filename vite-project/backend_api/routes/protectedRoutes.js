import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { verifyToken, requirePermission } from "../middleware/auth.js";

const router = express.Router();

/**
 * =========================
 * USERS
 * =========================
 */

// Look a user up by their exact email. Email is the unique handle an admin
// actually knows when someone asks to be made a workshop manager — searching
// a paginated user table for them doesn't scale past a few dozen accounts.
router.get(
  "/users/by-email",
  verifyToken,
  requirePermission("user:promote"),
  async (req, res) => {
    try {
      const email = String(req.query.email ?? "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ success: false, message: "email is required" });
      }
      const user = await User.findOne({ email }).select("firstname lastname email role");
      if (!user) {
        return res.status(404).json({ success: false, message: "No account with that email" });
      }
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// One role per call — the rebuilt dashboard fires one of these per role table
// (in parallel) rather than fetching everyone and filtering client-side.
// Includes superadmin, unlike the legacy /admins endpoint below, since the
// dashboard now needs its own superadmin table too.
router.get(
  "/users/by-role",
  verifyToken,
  requirePermission("admin:read"),
  async (req, res) => {
    try {
      const VALID_ROLES = [
        "superadmin",
        "admin",
        "vehicle-tracking-admin",
        "workshop-admin",
        "accounting-admin",
        "delivery-admin",
        "delivery-staff",
        "user",
      ];
      const role = String(req.query.role ?? "");
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      const users = await User.find({ role }).select("-password");
      res.json({ success: true, users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Get all normal users
router.get(
  "/users",
  verifyToken,
  requirePermission("user:read"),
  async (req, res) => {
    try {
      const users = await User.find({ role: "user" }).select("-password");
      res.json({ success: true, users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Create user
router.post(
  "/users",
  verifyToken,
  requirePermission("user:create"),
  async (req, res) => {
    try {
      const { firstname, lastname, email, password } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      const hashed = await bcrypt.hash(password, 10);

      const user = await User.create({
        firstname,
        lastname,
        email,
        password: hashed,
        role: "user",
      });

      const userObj = user.toObject();
      delete userObj.password;

      res.json({ success: true, user: userObj });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Delete user
router.delete(
  "/users/:id",
  verifyToken,
  requirePermission("user:delete"),
  async (req, res) => {
    try {
      const targetUser = await User.findById(req.params.id);

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (targetUser.role === "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Cannot delete superadmin",
        });
      }

      await User.findByIdAndDelete(req.params.id);

      res.json({ success: true, message: "User deleted" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * =========================
 * DATABASE (ALL USERS)
 * =========================
 */

router.get(
  "/database/users",
  verifyToken,
  requirePermission("database:read"),
  async (req, res) => {
    try {
      const users = await User.find({}).select("-password");
      res.json({ success: true, users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * =========================
 * ADMINS
 * =========================
 */

// Get admins
router.get(
  "/admins",
  verifyToken,
  requirePermission("admin:read"),
  async (req, res) => {
    try {
      // Includes the narrowed roles so they're visible and manageable in the
      // dashboard's Admins table rather than invisible.
      const admins = await User.find({
        role: { $in: ["admin", "vehicle-tracking-admin", "workshop-admin", "delivery-admin", "delivery-staff"] },
      }).select("-password");
      res.json({ success: true, admins });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Create admin
router.post(
  "/admins",
  verifyToken,
  requirePermission("admin:create"),
  async (req, res) => {
    try {
      const { firstname, lastname, email, password } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      }

      const hashed = await bcrypt.hash(password, 10);

      const newAdmin = await User.create({
        firstname,
        lastname,
        email,
        password: hashed,
        role: "admin",
      });

      const adminObj = newAdmin.toObject();
      delete adminObj.password;

      res.json({ success: true, user: adminObj });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Delete admin
router.delete(
  "/admins/:id",
  verifyToken,
  requirePermission("admin:delete"),
  async (req, res) => {
    try {
      const targetUser = await User.findById(req.params.id);

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }

      if (targetUser.role === "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Cannot delete superadmin",
        });
      }

      await User.findByIdAndDelete(req.params.id);

      res.json({ success: true, message: "Admin deleted" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * =========================
 * PROMOTION (ROLE CONTROL)
 * =========================
 */

router.patch(
  "/users/:id/promote",
  verifyToken,
  requirePermission("user:promote"),
  async (req, res) => {
    try {
      const { role, area, region } = req.body;
      const currentUser = req.user;

      const targetUser = await User.findById(req.params.id);

      // Not found
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Prevent self-role change
      if (currentUser.id === req.params.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot change your own role",
        });
      }

      // Invalid role
      if (!["admin", "superadmin", "vehicle-tracking-admin", "workshop-admin", "delivery-admin", "delivery-staff"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role",
        });
      }

      // Protect superadmin
      if (targetUser.role === "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Cannot modify superadmin",
        });
      }

      // Only superadmin can assign superadmin
      if (role === "superadmin" && currentUser.role !== "superadmin") {
        return res.status(403).json({
          success: false,
          message: "Only superadmin can promote to superadmin",
        });
      }

      // Admin restriction
      if (
        currentUser.role === "admin" &&
        targetUser.role !== "user"
      ) {
        return res.status(403).json({
          success: false,
          message: "Admin can only promote users",
        });
      }

      targetUser.role = role;
      // Keeps promotion and area/region assignment a single dashboard action
      // rather than a separate edit step. delivery-staff gets both (area is
      // their specific locality, region their broader assignment-matching
      // group); delivery-admin only ever needs a region — they manage a
      // whole region's worth of staff, not one locality.
      if (role === "delivery-staff") {
        if (typeof area === "string") targetUser.area = area;
        if (typeof region === "string") targetUser.region = region;
      } else if (role === "delivery-admin") {
        if (typeof region === "string") targetUser.region = region;
      }
      await targetUser.save();

      const userObj = targetUser.toObject();
      delete userObj.password;

      res.json({
        success: true,
        message: `${targetUser.firstname} promoted to ${role}`,
        user: userObj,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  }
);

export default router;