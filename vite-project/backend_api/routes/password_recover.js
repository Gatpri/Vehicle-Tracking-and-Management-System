import express from "express";
import crypto from "crypto";
import mailer from "../mailer.js";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import PasswordReset from "../models/PasswordReset.js";
const router = express.Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// Always answered identically whether or not the address exists, so this
// endpoint can't be used to enumerate which emails have accounts.
const SEND_OTP_RESPONSE = {
  success: true,
  message: "If that email has an account, an OTP has been sent to it.",
};

// STEP 1: Send OTP
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.json(SEND_OTP_RESPONSE);

    // randomInt is cryptographically secure; Math.random() is trivially
    // predictable and must never generate a credential.
    const otp = crypto.randomInt(100000, 1000000).toString();

    await PasswordReset.findOneAndUpdate(
      { email },
      { email, otp, attempts: 0, resetToken: null, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { upsert: true },
    );

    await mailer.send({
      to: email,
      from: "saugatkapri@gmail.com",
      subject: "Your OTP Code",
      text: `Your OTP is: ${otp}. It expires in 5 minutes.`,
    });

    res.json(SEND_OTP_RESPONSE);
  } catch (err) {
    console.error("send-otp failed:", err);
    res.status(500).json({ success: false, message: "Could not send OTP" });
  }
});

// STEP 2: Verify OTP — on success issues the one-time token step 3 requires.
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await PasswordReset.findOne({ email });
    if (!record) return res.json({ success: false, message: "OTP not found" });

    if (Date.now() > record.expiresAt.getTime()) {
      await PasswordReset.deleteOne({ email });
      return res.json({ success: false, message: "OTP expired" });
    }

    // Without a cap, a 6-digit code is exhaustible well inside the 5-minute
    // window.
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordReset.deleteOne({ email });
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new OTP.",
      });
    }

    if (record.otp !== otp) {
      record.attempts += 1;
      await record.save();
      return res.json({ success: false, message: "Wrong OTP" });
    }

    // Proof-of-OTP handed to the client; /reset-password accepts nothing else.
    const resetToken = crypto.randomBytes(32).toString("hex");
    record.resetToken = resetToken;
    record.otp = "";
    await record.save();

    res.json({ success: true, message: "OTP verified", resetToken });
  } catch (err) {
    console.error("verify-otp failed:", err);
    res.status(500).json({ success: false, message: "Could not verify OTP" });
  }
});

// STEP 3: Reset Password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;

    if (!email || !newPassword || !resetToken) {
      return res.status(400).json({
        success: false,
        message: "Email, new password and reset token are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const record = await PasswordReset.findOne({ email });

    if (!record || !record.resetToken) {
      return res.status(400).json({ success: false, message: "Verify your OTP first" });
    }

    if (Date.now() > record.expiresAt.getTime()) {
      await PasswordReset.deleteOne({ email });
      return res.status(400).json({ success: false, message: "Reset window expired" });
    }

    // timingSafeEqual needs equal-length buffers, hence the length guard first.
    const provided = Buffer.from(String(resetToken));
    const expected = Buffer.from(record.resetToken);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(400).json({ success: false, message: "Invalid reset token" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const updated = await User.findOneAndUpdate({ email }, { password: hashed });
    if (!updated) {
      return res.status(400).json({ success: false, message: "Invalid reset token" });
    }

    // Single use.
    await PasswordReset.deleteOne({ email });

    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("reset-password failed:", err);
    res.status(500).json({ success: false, message: "Could not reset password" });
  }
});


export default router;
