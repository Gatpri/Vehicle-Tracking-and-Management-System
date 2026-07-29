import mongoose from "mongoose";

const WalletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  balance: { type: Number, default: 0 }, // paisa
  currency: { type: String, default: "NPR" },
}, { timestamps: true });

const Wallet = mongoose.model("Wallet", WalletSchema);
export default Wallet;
