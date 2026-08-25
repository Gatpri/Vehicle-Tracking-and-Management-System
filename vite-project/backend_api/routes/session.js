import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { SESSION_COOKIE, clearSessionCookieOptions } from "../config/cookies.js";

const router = express.Router();

/**
 * Who is the caller? The frontend has no way to inspect the session cookie
 * itself (it is httpOnly by design), so this is the only way the React app
 * learns who is signed in — it calls this once on boot and holds the answer
 * in memory.
 *
 * That indirection is the point: role now comes from a freshly-read database
 * record on every page load, not from a JSON blob in localStorage that the
 * user could edit to hand themselves an admin shell.
 */
router.get("/me", verifyToken, (req, res) => {
  const u = req.user;
  res.status(200).json({
    success: true,
    user: {
      id: u._id,
      email: u.email,
      firstname: u.firstname,
      lastname: u.lastname,
      role: u.role,
      permissions: u.permissions,
    },
  });
});

/**
 * Ending the session is now a server-side act. Previously "logout" was
 * localStorage.removeItem in the browser; the cookie can only be removed by
 * the server that set it, so this route exists to do exactly that.
 *
 * Not guarded by verifyToken: clearing an already-expired or malformed
 * session must still succeed, or a user holding a bad cookie could never get
 * back to a clean state.
 */
router.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, clearSessionCookieOptions());
  res.status(200).json({ success: true, message: "Logged out" });
});

export default router;
