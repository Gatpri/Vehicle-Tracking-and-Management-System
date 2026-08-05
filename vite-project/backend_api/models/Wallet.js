import mongoose from "mongoose";

const WalletSchema = new mongoose.Schema({
  // Absent on the company wallet, which belongs to the platform rather than to
  // a person. Sparse so those documents don't collide on a shared null.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    sparse: true,
  },
  // "company" is the platform's own account: commission lands here, and every
  // withdrawal is paid out of the real eSewa balance it stands for. There is
  // exactly one of these.
  kind: { type: String, enum: ["user", "company"], default: "user", index: true },
  // For a user: their spendable virtual balance.
  // For the company: commission actually earned — the platform's own revenue.
  balance: { type: Number, default: 0 }, // paisa
  // Company wallet only. Real money sitting in the company's eSewa account on
  // behalf of users: every top-up adds to it, every payout takes from it.
  //
  // Kept apart from `balance` because they answer different questions. A
  // booking payment moves virtual balance between users but no real money
  // leaves eSewa, so it must not touch the float; a payout does leave, but is
  // not a business loss, so it must not touch revenue. Conflating them drove
  // the company balance negative on the first withdrawal.
  float: { type: Number, default: 0 }, // paisa
  // Held against withdrawal requests still awaiting review. Moved out of
  // `balance` when the request is made, so the same money can't be requested
  // twice or spent while an accounting-admin is still looking at it.
  pendingWithdrawal: { type: Number, default: 0 }, // paisa
  currency: { type: String, default: "NPR" },
}, { timestamps: true });

const Wallet = mongoose.model("Wallet", WalletSchema);
export default Wallet;
