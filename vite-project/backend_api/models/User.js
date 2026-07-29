import mongoose from "mongoose";

const LoginAttemptSchema = new mongoose.Schema({
  count: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname:  { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role: {
    type: String,
    enum: ["superadmin", "admin", "user"],
    default: "user",
  },
  // extra per-user permissions on top of their role (optional, starts empty)
  permissions: {
    type: [String],
    default: [],
  },
  // failed login attempts tracked per source IP, so a remote attacker
  // can't lock a victim out by failing logins from a different IP
  loginAttempts: {
    type: Map,
    of: LoginAttemptSchema,
    default: () => new Map(),
  },
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
export default User;