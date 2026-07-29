import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900; // 15 minutes

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    const user = await User.findOne({ email }); // need password hash to compare below

    if (!user) {
      return res.status(400).json({ success: false, message: "User not found" });
    }

    const attempt = user.loginAttempts.get(ip) || { count: 0, lockUntil: null };

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
        user.loginAttempts.set(ip, attempt);
        user.markModified("loginAttempts");
        await user.save();
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Try again in ${Math.ceil(LOCKOUT_SECONDS / 60)} minute(s).`,
          retryAfterSeconds: LOCKOUT_SECONDS,
        });
      }

      user.loginAttempts.set(ip, attempt);
      user.markModified("loginAttempts");
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        attemptsRemaining: MAX_ATTEMPTS - attempt.count,
      });
    }

    if (attempt.count > 0 || attempt.lockUntil) {
      user.loginAttempts.delete(ip);
      user.markModified("loginAttempts");
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "your-secret-key-change-this",
      { expiresIn: "24h" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
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