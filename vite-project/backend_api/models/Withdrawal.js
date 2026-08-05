import mongoose from "mongoose";

// A request to convert virtual wallet balance back into real money.
//
// Real funds live in the company's eSewa account the whole time — a top-up
// sends real money there and credits virtual balance here. A withdrawal is the
// reverse: an accounting-admin checks the request, sends the real transfer
// from the company account by hand, and marks it paid. Nothing here moves real
// money automatically; this is the record and the authorisation trail.
const WithdrawalSchema = new mongoose.Schema({
  // "company" draws down the platform's own commission revenue rather than a
  // person's balance. Held to a stricter standard: a payout reference and a
  // reason are both required before it can be marked paid, because nobody
  // else is watching their own money leave.
  kind: { type: String, enum: ["user", "company"], default: "user", index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
  // The pending ledger row this request created, flipped to success/failed
  // when it's actioned.
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  amount: { type: Number, required: true, min: 1 }, // paisa
  // Where the real money should be sent. Captured per request rather than on
  // the profile: someone may withdraw to a different eSewa ID than last time,
  // and the reviewer needs the one that was actually asked for.
  esewaId: { type: String, required: true, trim: true },
  accountName: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["pending", "paid", "rejected"],
    default: "pending",
    index: true,
  },
  // Set by the accounting-admin who actioned it.
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  // The real eSewa transfer reference, so a paid request can be traced back to
  // an actual transaction outside this system.
  payoutRef: { type: String, default: "" },
  note: { type: String, default: "" },
}, { timestamps: true });

WithdrawalSchema.index({ status: 1, createdAt: -1 });

const Withdrawal = mongoose.model("Withdrawal", WithdrawalSchema);
export default Withdrawal;
