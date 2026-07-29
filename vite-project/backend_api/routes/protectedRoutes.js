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
      const admins = await User.find({ role: "admin" }).select("-password");
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
      const { role } = req.body;
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
      if (!["admin", "superadmin"].includes(role)) {
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