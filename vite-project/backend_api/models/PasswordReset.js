import mongoose from "mongoose";

// Backs the forgot-password flow. Persisted rather than in-memory so a backend
// restart mid-flow doesn't strand the user, and so the attempt counter can't be
// wiped by simply waiting for a redeploy.
//
// resetToken is issued only once the OTP is verified, and /reset-password
// requires it — without that link the reset endpoint would accept any email and
// hand out account takeover to anyone who knows an address.
const PasswordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  // Cleared once verified so a consumed code can't be replayed — hence no
  // `required`, which would reject the empty string on save.
  otp: { type: String, default: "" },
  attempts: { type: Number, default: 0 },
  resetToken: { type: String, default: null },
  expiresAt: { type: Date, required: true },
});

PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model("PasswordReset", PasswordResetSchema);
export default PasswordReset;
