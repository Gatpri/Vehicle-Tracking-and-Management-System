import mongoose from "mongoose";

// Holds signups awaiting email verification. Persisted (not in-memory) so a
// backend restart between "register" and "click the email link" doesn't
// silently strand the pending account — expiresAt's TTL index lets MongoDB
// clean up unverified/expired signups on its own.
const PendingUserSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

PendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingUser = mongoose.model("PendingUser", PendingUserSchema);
export default PendingUser;
