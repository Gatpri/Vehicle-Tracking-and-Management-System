// Wipes all booking/delivery/payment test data and zeros every wallet back
// to 0 — a one-time clean-slate reset for pre-existing test bookings that
// predate the delivery-fee system and are in a state no backfill can cleanly
// fix (mixed old per-leg-fee documents, some missing fees entirely).
//
//   node backend_api/scripts/resetBookingData.js
//
// DESTRUCTIVE. Deletes every ServiceRequest, every Delivery, and every
// Transaction tied to a booking, then zeroes every Wallet's balance/float/
// pendingWithdrawal so the ledger doesn't end up with balances that no
// remaining transaction explains. Not safe to re-run for a second cleanup of
// the same kind of drift — this is a full reset, not a targeted backfill.
import "../env.js";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import ServiceRequest from "../models/ServiceRequest.js";
import Delivery from "../models/Delivery.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";

await connectDB();

const transactionResult = await Transaction.deleteMany({ relatedBooking: { $ne: null } });
console.log(`Transactions: deleted ${transactionResult.deletedCount} booking-related document(s).`);

const deliveryResult = await Delivery.deleteMany({});
console.log(`Deliveries: deleted ${deliveryResult.deletedCount} document(s).`);

const bookingResult = await ServiceRequest.deleteMany({});
console.log(`Bookings: deleted ${bookingResult.deletedCount} document(s).`);

const walletResult = await Wallet.updateMany({}, { balance: 0, float: 0, pendingWithdrawal: 0 });
console.log(`Wallets: zeroed balance/float/pendingWithdrawal for ${walletResult.modifiedCount} document(s).`);

await mongoose.disconnect();
