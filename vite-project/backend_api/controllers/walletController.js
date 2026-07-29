import crypto from "crypto";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { hasPermission } from "../policies/permissions.js";
import { buildTopupForm, decodeCallbackData, verifyTransactionStatus } from "../services/esewaService.js";
import { getIO } from "../config/socket.js";

const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  return wallet;
};

export const getMyWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    res.json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyTransactions = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    const { limit = 50 } = req.query;
    const transactions = await Transaction.find({ wallet: wallet._id })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200));
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const initiateTopup = async (req, res) => {
  try {
    const { amountNpr } = req.body;
    if (typeof amountNpr !== "number" || amountNpr <= 0) {
      return res.status(400).json({ success: false, message: "amountNpr must be a positive number" });
    }

    const wallet = await getOrCreateWallet(req.user._id);
    const transactionUuid = crypto.randomUUID();

    await Transaction.create({
      wallet: wallet._id,
      user: req.user._id,
      type: "topup",
      amount: Math.round(amountNpr * 100), // paisa
      status: "pending",
      gateway: "esewa",
      gatewayRef: transactionUuid,
    });

    const form = buildTopupForm({
      amountNpr,
      transactionUuid,
      successUrl: `${process.env.BACKEND_BASE_URL}/wallet/topup/verify`,
      failureUrl: `${process.env.BACKEND_BASE_URL}/wallet/topup/failure`,
    });

    res.json({ success: true, ...form });
  } catch (err) {
    const status = err.message.startsWith("Missing eSewa env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// eSewa redirects the raw browser here — never trust the redirect payload
// alone, always re-confirm with an authoritative server-to-server call.
export const verifyTopup = async (req, res) => {
  const frontendFail = (reason) => res.redirect(`${process.env.FRONTEND_URL}/wallet?status=failed&reason=${reason}`);

  try {
    const { data } = req.query;
    if (!data) return frontendFail("no_data");

    const decoded = decodeCallbackData(data);
    const transaction = await Transaction.findOne({ gatewayRef: decoded.transaction_uuid });
    if (!transaction) return frontendFail("unknown_transaction");
    if (transaction.status === "success") {
      return res.redirect(`${process.env.FRONTEND_URL}/wallet?status=success`); // already processed
    }

    const statusResult = await verifyTransactionStatus({
      transactionUuid: decoded.transaction_uuid,
      totalAmount: decoded.total_amount,
    });

    if (statusResult.status !== "COMPLETE") {
      transaction.status = "failed";
      transaction.gatewayResponse = statusResult;
      await transaction.save();
      return frontendFail("not_complete");
    }

    transaction.status = "success";
    transaction.gatewayResponse = statusResult;
    await transaction.save();

    const wallet = await Wallet.findByIdAndUpdate(
      transaction.wallet,
      { $inc: { balance: transaction.amount } },
      { returnDocument: "after" }
    );

    getIO().to(`user:${transaction.user}`).emit("wallet:updated", wallet);
    res.redirect(`${process.env.FRONTEND_URL}/wallet?status=success`);
  } catch (err) {
    res.redirect(`${process.env.FRONTEND_URL}/wallet?status=failed&reason=server_error`);
  }
};

export const topupFailure = async (req, res) => {
  try {
    const uuid = req.query.transaction_uuid || (req.query.data && decodeCallbackData(req.query.data).transaction_uuid);
    if (uuid) {
      await Transaction.updateOne({ gatewayRef: uuid, status: "pending" }, { status: "failed" });
    }
  } catch {
    // best-effort — the redirect below still happens regardless
  }
  res.redirect(`${process.env.FRONTEND_URL}/wallet?status=failed`);
};

export const payBooking = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const booking = await ServiceRequest.findById(bookingId);
    if (!booking || !booking.user.equals(req.user._id)) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }
    if (booking.status !== "completed") {
      return res.status(400).json({ success: false, message: "Booking isn't completed yet" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ success: false, message: "Booking is already paid" });
    }

    const amount = booking.finalPrice ?? booking.quotedPrice;
    const wallet = await getOrCreateWallet(req.user._id);
    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    wallet.balance -= amount;
    await wallet.save();

    const transaction = await Transaction.create({
      wallet: wallet._id,
      user: req.user._id,
      type: "payment",
      amount,
      status: "success",
      gateway: "internal",
      relatedBooking: booking._id,
    });

    booking.paymentStatus = "paid";
    await booking.save();

    getIO().to(`user:${req.user._id}`).emit("wallet:updated", wallet);
    res.json({ success: true, wallet, transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listAllWallets = async (req, res) => {
  try {
    if (!hasPermission(req.user.role, "wallet:read:any", req.user.permissions)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const filter = req.query.userId ? { user: req.query.userId } : {};
    const wallets = await Wallet.find(filter).populate("user", "firstname lastname email");
    res.json({ success: true, wallets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
