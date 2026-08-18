import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hasPermission } from "../policies/permissions.js";
import { JWT_SECRET } from "../config/jwt.js";

// Verify JWT and attach user to req
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ email: decoded.email }).select("-password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Identify the caller when they present a valid token, but let anonymous
// requests through untouched. For endpoints that serve both the public site
// and the admin area from one route: the controller decides what extra fields
// a privileged caller gets, instead of the route being either fully public or
// fully closed. A bad or expired token is treated as "not signed in" rather
// than an error — the endpoint works either way, so there is nothing to fail.
export const attachUserIfPresent = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    const user = await User.findOne({ email: decoded.email }).select("-password");
    if (user) req.user = user;
  } catch {
    // Anonymous is a valid state here.
  }
  next();
};

// Check role
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
    }
    next();
  };
};

// Check permission
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const allowed = hasPermission(req.user.role, permission, req.user.permissions);
    if (!allowed) {
      return res.status(403).json({ success: false, message: `Forbidden: missing permission '${permission}'` });
    }
    next();
  };
};