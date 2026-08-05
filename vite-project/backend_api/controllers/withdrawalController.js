import Withdrawal from "../models/Withdrawal.js";
import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import { getOrCreateUserWallet, getCompanyWallet, adjustCompanyFloat } from "../services/ledgerService.js";
import { notify } from "../services/notificationService.js";
import { getIO } from "../config/socket.js";

const rupees = (paisa) => `Rs ${(paisa / 100).toFixed(2)}`;

// Anyone with a balance can withdraw — a customer with leftover top-up, or a
// garage owner drawing down what they've earned.
//
// The amount is held out of `balance` immediately rather than at approval.
// Otherwise the same money could be requested twice, or spent on a booking
// while an accounting-admin was still reviewing the first request.
export const requestWithdrawal = async (req, res) => {
  try {
    const { amountNpr, esewaId, accountName } = req.body;
    if (typeof amountNpr !== "number" || amountNpr <= 0) {
      return res.status(400).json({ success: false, message: "amountNpr must be a positive number" });
    }
    if (!esewaId?.trim()) {
      return res.status(400).json({ success: false, message: "Your eSewa ID is required to receive the money" });
    }

    const amount = Math.round(amountNpr * 100);
    const wallet = await getOrCreateUserWallet(req.user._id);
    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: `You can withdraw at most ${rupees(wallet.balance)}`,
      });
    }

    wallet.balance -= amount;
    wallet.pendingWithdrawal += amount;
    await wallet.save();

    // A pending ledger row, not just a balance change. Without it the money
    // disappears from the statement with nothing explaining where it went
    // until an admin gets round to reviewing it.
    const entry = await Transaction.create({
      wallet: wallet._id,
      user: req.user._id,
      type: "withdrawal",
      amount,
      status: "pending",
      gateway: "esewa",
    });

    const withdrawal = await Withdrawal.create({
      user: req.user._id,
      wallet: wallet._id,
      amount,
      esewaId: esewaId.trim(),
      accountName: accountName?.trim() ?? "",
      transaction: entry._id,
    });

    getIO().to(`user:${req.user._id}`).emit("wallet:updated", wallet);
    // Reviewers are told immediately — a payout sitting unseen is the thing
    // people actually complain about.
    getIO().to("accounting").emit("withdrawal:new", withdrawal);

    res.status(201).json({ success: true, withdrawal, wallet });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Draws down the platform's own commission revenue. Deliberately separate from
// the user flow: it comes out of `balance` (money the company earned) rather
// than `float` (money it's holding for other people), and it can't be approved
// without a payout reference and a stated reason.
export const requestCompanyWithdrawal = async (req, res) => {
  try {
    const { amountNpr, esewaId, note } = req.body;
    if (typeof amountNpr !== "number" || amountNpr <= 0) {
      return res.status(400).json({ success: false, message: "amountNpr must be a positive number" });
    }
    if (!esewaId?.trim()) {
      return res.status(400).json({ success: false, message: "Destination eSewa ID is required" });
    }
    if (!note?.trim()) {
      return res.status(400).json({ success: false, message: "A reason is required for a company withdrawal" });
    }

    const amount = Math.round(amountNpr * 100);
    const company = await getCompanyWallet();
    if (company.balance < amount) {
      return res.status(400).json({
        success: false,
        message: `Commission earned is only ${rupees(company.balance)}`,
      });
    }
    // Never let a company draw exceed the real money actually sitting in eSewa,
    // or the payout would come out of users' float.
    if (company.float < amount) {
      return res.status(400).json({
        success: false,
        message: `Only ${rupees(company.float)} is actually held in eSewa — paying more would spend users' funds`,
      });
    }

    company.balance -= amount;
    company.pendingWithdrawal += amount;
    await company.save();

    const entry = await Transaction.create({
      wallet: company._id,
      type: "withdrawal",
      amount,
      status: "pending",
      gateway: "esewa",
    });

    const withdrawal = await Withdrawal.create({
      kind: "company",
      user: req.user._id, // who asked for it
      wallet: company._id,
      amount,
      esewaId: esewaId.trim(),
      note: note.trim(),
      transaction: entry._id,
    });

    getIO().to("accounting").emit("withdrawal:new", withdrawal);
    res.status(201).json({ success: true, withdrawal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The accounting-admin's queue, plus the company balance the payouts come out
// of — a reviewer needs to see whether the float actually covers what's
// pending before approving any of it.
export const listWithdrawals = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const [withdrawals, companyWallet] = await Promise.all([
      Withdrawal.find(filter)
        .populate("user", "firstname lastname email role")
        .populate("reviewedBy", "firstname lastname")
        .sort({ createdAt: -1 }),
      getCompanyWallet(),
    ]);

    const [pendingTotal] = await Withdrawal.aggregate([
      { $match: { status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      withdrawals,
      company: {
        // What the platform has earned in commission.
        revenue: companyWallet.balance,
        // Real money held in eSewa on users' behalf — what payouts come out of.
        float: companyWallet.float,
        pendingPayouts: pendingTotal?.total ?? 0,
        // The account the reviewer sends transfers from.
        esewaId: process.env.COMPANY_ESEWA_ID ?? "",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Marks a request paid: the accounting-admin has sent the real eSewa transfer
// from the company account by hand, and this records it. The held amount is
// released from the requester's wallet and taken off the company's balance,
// which is what makes the virtual ledger match the real account again.
export const approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ success: false, message: "Withdrawal not found" });
    if (withdrawal.status !== "pending") {
      return res.status(409).json({ success: false, message: `Already ${withdrawal.status}` });
    }

    // A company draw must be traceable to a real transfer — no reference, no
    // approval. A user payout can be recorded without one.
    if (withdrawal.kind === "company" && !req.body.payoutRef?.trim()) {
      return res.status(400).json({
        success: false,
        message: "A payout reference is required to approve a company withdrawal",
      });
    }

    const wallet = await Wallet.findById(withdrawal.wallet);
    // The held amount leaves for good — `balance` was already reduced when the
    // request was made, so only the hold is cleared here.
    wallet.pendingWithdrawal -= withdrawal.amount;
    await wallet.save();

    // The row that has been sitting as "withdrawal pending" on their statement
    // since they asked now reads "withdrawn".
    if (withdrawal.transaction) {
      await Transaction.findByIdAndUpdate(withdrawal.transaction, { status: "success" });
    }

    // Real money left the company's eSewa account either way, so the float
    // drops. For a user payout that's all that changes — the platform was only
    // holding it on their behalf. For a company draw the revenue was already
    // deducted at request time, so this is the matching real-money movement.
    await adjustCompanyFloat(-withdrawal.amount, {
      type: "withdrawal",
      // A company draw already booked its own row on this very wallet.
      recordEntry: withdrawal.kind !== "company",
    });

    withdrawal.status = "paid";
    withdrawal.reviewedBy = req.user._id;
    withdrawal.reviewedAt = new Date();
    withdrawal.payoutRef = req.body.payoutRef ?? "";
    withdrawal.note = req.body.note ?? "";
    await withdrawal.save();

    getIO().to(`user:${withdrawal.user}`).emit("wallet:updated", wallet);
    await notify({
      user: withdrawal.user,
      type: "general",
      title: "Withdrawal paid",
      body: `${rupees(withdrawal.amount)} sent to ${withdrawal.esewaId}`,
      link: "/wallet",
    });

    res.json({ success: true, withdrawal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Refuses the request and puts the held money back where it came from.
export const rejectWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ success: false, message: "Withdrawal not found" });
    if (withdrawal.status !== "pending") {
      return res.status(409).json({ success: false, message: `Already ${withdrawal.status}` });
    }

    const wallet = await Wallet.findById(withdrawal.wallet);
    wallet.pendingWithdrawal -= withdrawal.amount;
    wallet.balance += withdrawal.amount; // released back to spendable
    await wallet.save();

    // Marked failed rather than deleted: a refused request is part of the
    // history, and the statement should show it was attempted.
    if (withdrawal.transaction) {
      await Transaction.findByIdAndUpdate(withdrawal.transaction, { status: "failed" });
    }

    withdrawal.status = "rejected";
    withdrawal.reviewedBy = req.user._id;
    withdrawal.reviewedAt = new Date();
    withdrawal.note = req.body.note ?? "";
    await withdrawal.save();

    getIO().to(`user:${withdrawal.user}`).emit("wallet:updated", wallet);
    await notify({
      user: withdrawal.user,
      type: "general",
      title: "Withdrawal rejected",
      body: `${rupees(withdrawal.amount)} returned to your wallet${withdrawal.note ? ` — ${withdrawal.note}` : ""}`,
      link: "/wallet",
    });

    res.json({ success: true, withdrawal });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
