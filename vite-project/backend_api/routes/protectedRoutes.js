import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { verifyToken, requirePermission } from "../middleware/auth.js";

const router = express.Router();

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

// Which role listings each viewer may read, mirroring VISIBLE_ROLE_TABLES in
// the dashboard. Superadmin sees every role; admin sees everything except
// superadmin (hidden outright, not just un-actionable); the narrowed admin
// roles see only their own peer listing, which is what makes their dashboard a
// read-only roster. Roles absent from this map read no role listings at all.
const VISIBLE_ROLE_TABLES = {
  superadmin: VALID_ROLES,
  admin: VALID_ROLES.filter((r) => r !== "superadmin"),
  "vehicle-tracking-admin": ["vehicle-tracking-admin"],
  "delivery-admin": ["delivery-admin"],
};

// Which roles each viewer may *assign* — by creating an account outright or by
// promoting an existing one. Narrower than VISIBLE_ROLE_TABLES on purpose:
// seeing a roster is not authority over it. Only superadmin mints a
// superadmin, and nobody assigns "user" here (that's what self-registration
// and POST /users are for).
const ASSIGNABLE_ROLES = {
  superadmin: [
    "superadmin",
    "admin",
    "vehicle-tracking-admin",
    "workshop-admin",
    "accounting-admin",
    "delivery-admin",
    "delivery-staff",
  ],
  admin: [
    "admin",
    "vehicle-tracking-admin",
    "workshop-admin",
    "accounting-admin",
    "delivery-admin",
    "delivery-staff",
  ],
};

const canAssignRole = (viewerRole, targetRole) =>
  (ASSIGNABLE_ROLES[viewerRole] ?? []).includes(targetRole);

// Returning err.message to the client leaked Mongoose internals — a malformed
// :id, for instance, echoed back a CastError naming the model and schema path.
// The detail belongs in the server log, not the response.
const handleServerError = (res, err) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Something went wrong" });
};

// Admin-created accounts went through none of the checks self-registration
// enforces in signup.js, so an admin could create an account with a 1-character
// password or a malformed email that its owner could then never reset.
const validateNewAccount = ({ firstname, lastname, email, password }) => {
  if (!firstname?.trim() || !lastname?.trim()) return "First and last name are required";
  if (firstname.length > 50 || lastname.length > 50) return "Names must be under 50 characters";
  if (!email?.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
  if (!password || password.length < 8) return "Password must be at least 8 characters long";
  return null;
};

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
      handleServerError(res, err);
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
  async (req, res) => {
    try {
      const role = String(req.query.role ?? "");
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }

      // Mirrors VISIBLE_ROLE_TABLES in the dashboard. Enforced here as well
      // because hiding a table in the UI hides nothing from someone calling
      // this endpoint directly — a vehicle-tracking-admin must not be able to
      // curl ?role=superadmin and enumerate the accounts above them.
      if (!(VISIBLE_ROLE_TABLES[req.user.role] ?? []).includes(role)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: you cannot view that role",
        });
      }

      const users = await User.find({ role }).select("-password");
      res.json({ success: true, users });
    } catch (err) {
      handleServerError(res, err);
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
      handleServerError(res, err);
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

      const invalid = validateNewAccount(req.body);
      if (invalid) {
        return res.status(400).json({ success: false, message: invalid });
      }

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
      handleServerError(res, err);
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

      // Mirrors the self-role-change guard on /promote — deleting your own
      // account mid-session leaves a valid token pointing at a missing user.
      if (req.user.id === req.params.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot delete your own account",
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
      handleServerError(res, err);
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
      handleServerError(res, err);
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
      handleServerError(res, err);
    }
  }
);

// Create an admin-tier account. `role` defaults to "admin" so existing callers
// keep working; passing any other role creates that role directly, subject to
// the same ASSIGNABLE_ROLES matrix that governs promotion — creating an
// account is just promotion with an extra step, so it can't be a way around
// the tighter rules there.
router.post(
  "/admins",
  verifyToken,
  requirePermission("admin:create"),
  async (req, res) => {
    try {
      const { firstname, lastname, email, password, area, region } = req.body;
      const role = req.body.role ?? "admin";

      const invalid = validateNewAccount(req.body);
      if (invalid) {
        return res.status(400).json({ success: false, message: invalid });
      }

      if (!canAssignRole(req.user.role, role)) {
        return res.status(403).json({
          success: false,
          message: `You cannot create an account with the '${role}' role`,
        });
      }

      // A delivery-admin manages a whole region, so one without a region has
      // no scope at all and would silently manage nobody.
      if (role === "delivery-admin" && !region?.trim()) {
        return res.status(400).json({
          success: false,
          message: "A delivery-admin needs a region",
        });
      }
      if (role === "delivery-staff" && !area?.trim()) {
        return res.status(400).json({
          success: false,
          message: "A delivery-staff member needs an area",
        });
      }

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
        role,
        ...(area?.trim() ? { area: area.trim() } : {}),
        ...(region?.trim() ? { region: region.trim() } : {}),
      });

      const adminObj = newAdmin.toObject();
      delete adminObj.password;

      res.json({ success: true, user: adminObj });
    } catch (err) {
      handleServerError(res, err);
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

      if (req.user.id === req.params.id) {
        return res.status(400).json({
          success: false,
          message: "You cannot delete your own account",
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
      handleServerError(res, err);
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

      // Invalid role. Sourced from ASSIGNABLE_ROLES so this list can't drift
      // out of step with the create endpoint again — accounting-admin was
      // missing from the old hardcoded array, silently breaking the
      // dashboard's "→ Accounting Admin" button.
      if (!VALID_ROLES.includes(role) || role === "user") {
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

      // Covers "only superadmin assigns superadmin" and every other
      // viewer/target pairing in one check.
      if (!canAssignRole(currentUser.role, role)) {
        return res.status(403).json({
          success: false,
          message: `You cannot assign the '${role}' role`,
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
      handleServerError(res, err);
    }
  }
);

export default router;