import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
  // Absent on company-wallet entries, which belong to no one person.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // denormalized for query convenience
  // One booking payment writes three of these: the customer's `payment` debit,
  // the garage's `earning` credit, and the platform's `commission` credit —
  // so the three ledgers always sum back to the amount charged.
  type: {
    type: String,
    enum: ["topup", "payment", "refund", "adjustment", "commission", "earning", "withdrawal"],
    required: true,
  },
  amount: { type: Number, required: true }, // paisa
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
  gateway: { type: String, enum: ["esewa", "internal"], required: true },
  // eSewa's transaction_uuid. Deliberately has no default: internal
  // transactions must leave the field *absent*, not null — see the index below.
  gatewayRef: { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null }, // raw verified response, audit trail
}, { timestamps: true });

// One transaction per eSewa reference, so a replayed callback can't credit
// twice. A partial index rather than `sparse`: sparse only skips documents
// where the field is missing, so a single explicit `gatewayRef: null` still
// occupies the index — and the second internal transaction then collides with
// "E11000 duplicate key { gatewayRef: null }". Matching on $type "string"
// ignores both null and absent, which is what's actually meant here.
TransactionSchema.index(
  { gatewayRef: 1 },
  { unique: true, partialFilterExpression: { gatewayRef: { $type: "string" } } }
);

const Transaction = mongoose.model("Transaction", TransactionSchema);
export default Transaction;
