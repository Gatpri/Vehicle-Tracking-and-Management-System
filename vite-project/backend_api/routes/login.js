import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { JWT_SECRET } from "../config/jwt.js";
import { SESSION_COOKIE, sessionCookieOptions } from "../config/cookies.js";
import { tokenForClient } from "../config/clientKind.js";

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900; // 15 minutes

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Lockout is keyed per-account, not per-IP. It used to key on req.ip, but
    // Docker's port forwarding rewrites the source address to the bridge
    // gateway (172.18.0.1) before nginx ever sees it, so X-Forwarded-For
    // carries an address that is already lost and every browser on the
    // network landed in the same bucket — five bad guesses by anyone locked
    // that account for everyone.
    //
    // Keying on the account is also the behaviour you actually want from a
    // brute-force guard: it caps guesses against a given account no matter how
    // many addresses they come from, whereas per-IP counting is trivially
    // defeated by rotating source addresses.
    //
    // The field stays a Map so existing documents (which hold IP-keyed
    // entries) still load; those stale keys are simply never read again.
    const ATTEMPT_KEY = "account";

    const user = await User.findOne({ email }); // need password hash to compare below

    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const attempt = user.loginAttempts.get(ATTEMPT_KEY) || { count: 0, lockUntil: null };

    if (attempt.lockUntil && attempt.lockUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((attempt.lockUntil.getTime() - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
        retryAfterSeconds,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      attempt.count += 1;

      if (attempt.count >= MAX_ATTEMPTS) {
        attempt.lockUntil = new Date(Date.now() + LOCKOUT_SECONDS * 1000);
        attempt.count = 0;
        user.loginAttempts.set(ATTEMPT_KEY, attempt);
        user.markModified("loginAttempts");
        await user.save();
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minute(s).`,
          retryAfterSeconds: LOCKOUT_SECONDS,
        });
      }

      user.loginAttempts.set(ATTEMPT_KEY, attempt);
      user.markModified("loginAttempts");
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        attemptsRemaining: MAX_ATTEMPTS - attempt.count,
      });
    }

    if (attempt.count > 0 || attempt.lockUntil) {
      user.loginAttempts.delete(ATTEMPT_KEY);
      user.markModified("loginAttempts");
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // The token goes into an httpOnly cookie rather than the response body:
    // returning it here is what previously forced the frontend to stash it in
    // localStorage, where any injected script could read it.
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());

    // tokenForClient adds `token` only for the native app, which has no cookie
    // jar and must hold the session in the device keystore instead. Browsers
    // get `{}` here and keep reading the session from the httpOnly cookie
    // alone — see config/clientKind.js.
    res.status(200).json({
      success: true,
      message: "Login successful",
      ...tokenForClient(req, token),
      user: {
        email: user.email,
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role,
        permissions: user.permissions,
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;