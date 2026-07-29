import express from "express";
import mailer from "../mailer.js";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
const router = express.Router();


// Store OTPs temporarily
const otpStore = {};

// STEP 1: Send OTP
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  // Check if user exists
  const user = await User.findOne({ email });
  if (!user) return res.json({ success: false, message: "Email not found" });

  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save OTP with expiry (5 minutes)
  otpStore[email] = { otp, expiresAt: Date.now() + 5 * 60 * 1000 };

  // Send email via Gmail SMTP
  await mailer.send({
    to: email,
    from: "saugatkapri@gmail.com",
    subject: "Your OTP Code",
    text: `Your OTP is: ${otp}. It expires in 5 minutes.`,
  });

  res.json({ success: true, message: "OTP sent to your email" });
});

// STEP 2: Verify OTP
router.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  const record = otpStore[email];
  if (!record) return res.json({ success: false, message: "OTP not found" });
  if (Date.now() > record.expiresAt) return res.json({ success: false, message: "OTP expired" });
  if (record.otp !== otp) return res.json({ success: false, message: "Wrong OTP" });

  // OTP matched — clear it
  delete otpStore[email];
  res.json({ success: true, message: "OTP verified" });
});

// STEP 3: Reset Password
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  const hashed = await bcrypt.hash(newPassword, 10);
  await User.findOneAndUpdate({ email }, { password: hashed });

  res.json({ success: true, message: "Password reset successful" });
});


export default router;


