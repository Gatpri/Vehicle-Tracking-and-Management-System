import Wallet from "../models/Wallet.js";
import Transaction from "../models/Transaction.js";
import Delivery from "../models/Delivery.js";
import { getIO } from "../config/socket.js";

// The platform's cut of every booking payment. Real money for the whole
// booking already sits in the company's eSewa account (that's where top-ups
// land); this decides how the virtual balance is divided afterwards.
export const COMMISSION_RATE = 0.05;

export const commissionOn = (amount) => Math.round(amount * COMMISSION_RATE);

export const getCompanyWallet = async () => {
  let wallet = await Wallet.findOne({ kind: "company" });
  if (!wallet) wallet = await Wallet.create({ kind: "company" });
  return wallet;
};

export const getOrCreateUserWallet = async (userId) => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) wallet = await Wallet.create({ user: userId });
  return wallet;
};

// Telling someone their balance changed must never be able to undo the change.
// getIO() throws when sockets aren't up — a script, a migration, startup — and
// an unguarded emit here would abort a settlement *after* the debit had already
// been saved, leaving money taken from one wallet and credited to none.
const announceBalance = (wallet) => {
  if (!wallet.user) return; // company wallet belongs to nobody to notify
  try {
    getIO().to(`user:${wallet.user}`).emit("wallet:updated", wallet);
  } catch {
    // No socket server (CLI script, or not yet listening). The balance is
    // already persisted; the client picks it up on its next fetch.
  }
};

// Moves real money in or out of the company's eSewa account, recording it for
// audit. Positive when a top-up lands, negative when a payout is sent.
//
// Note this touches `float`, never `balance` — the platform is holding this
// money for someone else, it hasn't earned it.
// `recordEntry: false` when the caller has already written the ledger row —
// a company withdrawal creates its own pending entry when requested and flips
// it on approval, so booking a second one here would double-count it.
export const adjustCompanyFloat = async (amount, { type, gatewayRef, recordEntry = true } = {}) => {
  const company = await getCompanyWallet();
  company.float += amount;
  await company.save();

  if (recordEntry) {
    await Transaction.create({
      wallet: company._id,
      type: type ?? (amount >= 0 ? "topup" : "withdrawal"),
      amount: Math.abs(amount),
      status: "success",
      gateway: "esewa",
      ...(gatewayRef && { gatewayRef }),
    });
  }

  return company;
};

// Records one movement and keeps the wallet's balance in step with it. Every
// balance change in the system goes through here, so a transaction can never
// be written without the matching balance move (or the reverse).
export const postEntry = async ({ wallet, type, amount, relatedBooking = null, gateway = "internal", gatewayRef }) => {
  wallet.balance += amount; // negative for debits
  await wallet.save();

  const entry = await Transaction.create({
    wallet: wallet._id,
    ...(wallet.user && { user: wallet.user }),
    type,
    amount: Math.abs(amount),
    status: "success",
    gateway,
    ...(gatewayRef && { gatewayRef }),
    relatedBooking,
  });

  announceBalance(wallet);
  return entry;
};

/**
 * Settles a booking: the customer is debited the combined amount (parts/
 * labor + the one combined round-trip delivery fee, if a delivery leg was
 * assigned), funding the platform's commission and the garage's earning on
 * the parts/labor share from that single payment.
 *
 * The delivery-fee share is handled separately by settleDeliveryFee below,
 * called from here when a leg with staff already exists at payment time
 * (the common case — a pickup leg, assigned before the booking is ever
 * paid), or later from assignDelivery when a return leg is assigned after
 * the booking is already paid. Because one staff member is required across
 * both legs of a booking (enforced in assignDelivery), there's only ever
 * one recipient — settleDeliveryFee always pays the full 95% in one go, no
 * splitting between two people.
 *
 * `workshopOwnerId` may be null when a garage has no manager assigned yet;
 * the garage's share then stays with the company rather than being lost, and
 * can be transferred once an owner exists.
 */
export const settleBookingPayment = async ({ booking, customerWallet, workshopOwnerId }) => {
  const partsAmount = booking.finalPrice ?? booking.quotedPrice ?? 0;
  const deliveryFee = booking.deliveryFee ?? 0;
  const amount = partsAmount + deliveryFee;

  await postEntry({ wallet: customerWallet, type: "payment", amount: -amount, relatedBooking: booking._id });

  const companyWallet = await getCompanyWallet();

  // Parts/labor split — the garage. Unchanged math, computed on partsAmount
  // alone rather than the combined total.
  if (partsAmount > 0) {
    const partsCommission = commissionOn(partsAmount);
    // Subtraction, not a second multiplication — the two shares always add
    // back to exactly partsAmount with no paisa lost to rounding.
    const workshopShare = partsAmount - partsCommission;
    await postEntry({ wallet: companyWallet, type: "commission", amount: partsCommission, relatedBooking: booking._id });
    if (workshopOwnerId) {
      const ownerWallet = await getOrCreateUserWallet(workshopOwnerId);
      await postEntry({ wallet: ownerWallet, type: "earning", amount: workshopShare, relatedBooking: booking._id });
    } else {
      await postEntry({ wallet: companyWallet, type: "earning", amount: workshopShare, relatedBooking: booking._id });
    }
  }

  booking.paymentStatus = "paid";
  await booking.save();

  // Pay out the delivery fee now if a leg with staff already exists
  // (almost always the pickup leg, the only one that can exist before
  // payment happens). If no leg has staff yet, there's nothing to pay —
  // whichever leg is assigned later triggers this same payout itself, from
  // assignDelivery.
  if (deliveryFee > 0) {
    const anyLeg = await Delivery.findOne({ booking: booking._id, staff: { $ne: null } });
    if (anyLeg) await settleDeliveryFee(anyLeg, booking);
  }

  return { partsAmount, deliveryFee, amount };
};

/**
 * Pays a booking's whole combined deliveryFee (95% share, after a flat 5%
 * commission) to whichever single staff member is assigned to it. Safe to
 * call whenever settlement becomes possible — right after payment if a leg
 * already has staff, or right after a leg is assigned if the booking is
 * already paid — since same-staff enforcement in assignDelivery guarantees
 * there is only ever one recipient across both legs, never two.
 *
 * Checks BOTH legs' feeSettledAt (not just the one passed in) so it can
 * never double-pay regardless of which leg happens to trigger the call.
 * No-ops if the booking isn't paid yet, there's no fee, or no staff.
 */
export const settleDeliveryFee = async (delivery, booking) => {
  if (booking.paymentStatus !== "paid") return null;
  if (!booking.deliveryFee || !delivery.staff) return null;

  const alreadySettled = await Delivery.exists({ booking: booking._id, feeSettledAt: { $ne: null } });
  if (alreadySettled) return null;

  const commission = commissionOn(booking.deliveryFee);
  const staffShare = booking.deliveryFee - commission;

  const companyWallet = await getCompanyWallet();
  await postEntry({ wallet: companyWallet, type: "commission", amount: commission, relatedBooking: booking._id });

  const staffWallet = await getOrCreateUserWallet(delivery.staff);
  await postEntry({ wallet: staffWallet, type: "earning", amount: staffShare, relatedBooking: booking._id });

  delivery.feeSettledAt = new Date();
  await delivery.save();

  return { commission, staffShare };
};
