import crypto from "crypto";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import ServiceRequest from "../models/ServiceRequest.js";
import Workshop from "../models/Workshop.js";
import { getOrCreateUserWallet, getCompanyWallet, settleBookingPayment, adjustCompanyFloat } from "../services/ledgerService.js";
import { buildStatement, summariseStatement } from "../services/statementService.js";
import { hasPermission } from "../policies/permissions.js";
import { buildTopupForm, decodeCallbackData, verifyTransactionStatus } from "../services/esewaService.js";
import { getIO } from "../config/socket.js";
import { BOOKING_STATUS } from "../constants/bookingWorkflow.js";

const getOrCreateWallet = getOrCreateUserWallet;

// The one combined round-trip delivery fee (if any) is a plain field
// directly on the booking — no async lookup needed to resolve it anymore.
const bookingAmount = (booking) => (booking.finalPrice ?? booking.quotedPrice ?? 0) + (booking.deliveryFee ?? 0);

// Splits a booking payment across customer, platform, garage, and (if a
// delivery leg was assigned) the delivery-staff. Shared by the two ways a
// booking gets settled — paying from an existing balance, and an eSewa
// payment that lands in the wallet first — so both produce identical ledger
// entries rather than two subtly different notions of "paid".
const settleBookingFromWallet = async (booking, wallet) => {
  const workshop = await Workshop.findById(booking.workshop).select("managedBy");
  const split = await settleBookingPayment({
    booking,
    customerWallet: wallet,
    workshopOwnerId: workshop?.managedBy ?? null,
  });
  return { wallet, split };
};

// Shared guard: is this booking one the caller may pay, and is it payable?
const loadPayableBooking = async (bookingId, userId) => {
  const booking = await ServiceRequest.findById(bookingId);
  if (!booking || !booking.user.equals(userId)) {
    return { error: { status: 404, message: "Booking not found" } };
  }
  // Step 10: the workshop has to ask for payment first — paying earlier would
  // jump the estimate steps the whole workflow exists to enforce.
  if (booking.status !== BOOKING_STATUS.PAYMENT_PENDING) {
    return { error: { status: 400, message: "This booking isn't awaiting payment yet" } };
  }
  if (booking.paymentStatus === "paid") {
    return { error: { status: 400, message: "Booking is already paid" } };
  }
  if (!bookingAmount(booking)) {
    return { error: { status: 400, message: "This booking has no price set yet" } };
  }
  return { booking };
};

export const getMyWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    // Shown at checkout so a user can see which account their money goes to.
    res.json({ success: true, wallet, companyEsewaId: process.env.COMPANY_ESEWA_ID ?? "" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyTransactions = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user._id);
    const transactions = await buildStatement(wallet._id, {
      limit: Math.min(Number(req.query.limit ?? 50), 200),
    });
    res.json({ success: true, transactions, summary: summariseStatement(transactions) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Any user's wallet, for superadmin / admin / accounting-admin. A garage owner
// or customer can only ever reach their own via /wallet/transactions, so the
// permission check here is the whole gate.
export const getUserStatement = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.params.userId }).populate(
      "user",
      "firstname lastname email role"
    );
    if (!wallet) return res.status(404).json({ success: false, message: "That user has no wallet yet" });

    const transactions = await buildStatement(wallet._id, { limit: 200 });
    res.json({
      success: true,
      wallet: {
        _id: wallet._id,
        user: wallet.user,
        balance: wallet.balance,
        pendingWithdrawal: wallet.pendingWithdrawal,
      },
      transactions,
      summary: summariseStatement(transactions),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The platform's own account: commission earned, plus the real eSewa float it
// holds for users. Same permission as any other wallet.
export const getCompanyStatement = async (req, res) => {
  try {
    const wallet = await getCompanyWallet();
    const transactions = await buildStatement(wallet._id, { limit: 200, viewer: "company" });
    res.json({
      success: true,
      wallet: {
        revenue: wallet.balance,
        float: wallet.float,
        esewaId: process.env.COMPANY_ESEWA_ID ?? "",
      },
      transactions,
      summary: summariseStatement(transactions),
    });
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
      successUrl: `${process.env.BACKEND_BASE_URL}/api/wallet/topup/verify`,
      failureUrl: `${process.env.BACKEND_BASE_URL}/api/wallet/topup/failure`,
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

    // The real rupees just landed in the company's eSewa account; the credit
    // above is the matching virtual balance. Tracking the float is what lets
    // an accounting-admin see whether payouts are actually covered.
    await adjustCompanyFloat(transaction.amount, { type: "topup", gatewayRef: `float-${transaction.gatewayRef}` });

    getIO().to(`user:${transaction.user}`).emit("wallet:updated", wallet);

    // Paid for a specific booking rather than a plain top-up: the money has
    // landed in the wallet, so settle straight away and send them back to
    // their bookings instead of the wallet page.
    if (transaction.relatedBooking) {
      const booking = await ServiceRequest.findById(transaction.relatedBooking);
      if (booking && booking.paymentStatus !== "paid" && wallet.balance >= bookingAmount(booking)) {
        await settleBookingFromWallet(booking, wallet);
      }
      return res.redirect(`${process.env.FRONTEND_URL}/bookings?status=paid`);
    }

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
    const { booking, error } = await loadPayableBooking(req.body.bookingId, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const wallet = await getOrCreateWallet(req.user._id);
    if (wallet.balance < bookingAmount(booking)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        // Lets the UI offer eSewa instead of just refusing.
        shortfall: bookingAmount(booking) - wallet.balance,
      });
    }

    const { wallet: updated, split } = await settleBookingFromWallet(booking, wallet);
    res.json({ success: true, wallet: updated, split });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Pay a booking with eSewa directly, without topping up first.
//
// Rather than a second gateway integration, this reuses the top-up flow for
// the exact booking amount and tags the transaction with the booking. When
// eSewa confirms, verifyTopup credits the wallet and immediately settles the
// booking from it — so the money still passes through the wallet ledger and
// there's one definition of "paid", not two.
export const payBookingWithEsewa = async (req, res) => {
  try {
    const { booking, error } = await loadPayableBooking(req.body.bookingId, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const wallet = await getOrCreateWallet(req.user._id);
    const amount = bookingAmount(booking);
    const transactionUuid = crypto.randomUUID();

    await Transaction.create({
      wallet: wallet._id,
      user: req.user._id,
      type: "topup",
      amount,
      status: "pending",
      gateway: "esewa",
      gatewayRef: transactionUuid,
      relatedBooking: booking._id,
    });

    const form = buildTopupForm({
      amountNpr: amount / 100,
      transactionUuid,
      successUrl: `${process.env.BACKEND_BASE_URL}/api/wallet/topup/verify`,
      failureUrl: `${process.env.BACKEND_BASE_URL}/api/wallet/topup/failure`,
    });

    res.json({ success: true, ...form });
  } catch (err) {
    const status = err.message.startsWith("Missing eSewa env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

export const listAllWallets = async (req, res) => {
  try {
    if (!hasPermission(req.user.role, "wallet:read:any", req.user.permissions)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    // kind: "user" excludes the company wallet, which has no user to populate
    // and is served separately by /wallet/company.
    const filter = { kind: "user", ...(req.query.userId && { user: req.query.userId }) };
    const wallets = await Wallet.find(filter)
      .populate("user", "firstname lastname email role")
      .sort({ balance: -1 });
    res.json({ success: true, wallets });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
