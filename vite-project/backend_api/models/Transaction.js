import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // denormalized for query convenience
  type: { type: String, enum: ["topup", "payment", "refund", "adjustment"], required: true },
  amount: { type: Number, required: true }, // paisa
  status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
  gateway: { type: String, enum: ["esewa", "internal"], required: true },
  gatewayRef: { type: String, default: null }, // eSewa's transaction_uuid
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null }, // raw verified response, audit trail
}, { timestamps: true });

TransactionSchema.index({ gatewayRef: 1 }, { unique: true, sparse: true });

const Transaction = mongoose.model("Transaction", TransactionSchema);
export default Transaction;
