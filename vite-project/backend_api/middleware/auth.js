import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { hasPermission } from "../policies/permissions.js";
import { JWT_SECRET } from "../config/jwt.js";
import { SESSION_COOKIE } from "../config/cookies.js";

// The session arrives one of two ways, and which one depends on the client:
//
//   Browsers  — an httpOnly cookie the browser attaches on its own. Page
//               JavaScript cannot read it, which is the whole point.
//   Native    — an `Authorization: Bearer <token>` header. The mobile app has
//               no cookie jar tied to an origin, so it holds the token in the
//               OS keystore (expo-secure-store) and sets the header itself.
//
// The cookie is checked FIRST so that a browser can never be talked into
// authenticating as someone else by an attacker-supplied header — on the web
// the cookie remains the only thing that counts. The header is a fallback for
// clients that had no cookie to send in the first place.
export const readSessionToken = (req) => {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;

  const header = req.headers?.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;

  return null;
};

// Verify JWT and attach user to req
export const verifyToken = async (req, res, next) => {
  const token = readSessionToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

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
  const token = readSessionToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
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
