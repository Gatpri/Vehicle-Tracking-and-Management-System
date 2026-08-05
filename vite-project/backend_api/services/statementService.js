import Transaction from "../models/Transaction.js";

// Money is only meaningful with a counterparty. A row reading "earning
// Rs 1900" tells a garage owner nothing; "Rs 1900 from Saugat Kapri —
// full-servicing (GA 19 PA 4630)" tells them which job paid them. Every
// statement in the system is built here so all three audiences — the owner,
// the customer, and an admin looking at someone else's wallet — read the same
// description of the same movement.
const describe = (entry, viewer) => {
  const booking = entry.relatedBooking;
  const workshop = booking?.workshop;
  const customer = booking?.user;
  const service = booking?.serviceType;
  const plate = booking?.vehicle?.plateNumber;

  const job = [service, plate && `(${plate})`].filter(Boolean).join(" ");

  switch (entry.type) {
    case "topup":
      return {
        direction: "in",
        source: viewer === "company"
          ? "Customer top-up received in the company eSewa account"
          : "Top-up via eSewa",
      };
    case "payment":
      return {
        direction: "out",
        source: workshop?.name
          ? `Paid ${workshop.name}${job ? ` for ${job}` : ""}`
          : "Service payment",
      };
    case "commission":
      return {
        direction: "in",
        source: workshop?.name
          ? `5% commission on ${workshop.name}${job ? ` — ${job}` : ""}`
          : "Platform commission",
      };
    case "earning":
      return {
        direction: "in",
        source: customer
          ? `From ${customer.firstname} ${customer.lastname}${job ? ` — ${job}` : ""}`
          : `Service earning${job ? ` — ${job}` : ""}`,
      };
    case "withdrawal":
      return {
        direction: "out",
        source: viewer === "company"
          ? "Paid out to a user's eSewa account"
          : "Withdrawn to your eSewa account",
      };
    case "refund":
      return { direction: "in", source: "Refund" };
    case "adjustment":
      return { direction: "in", source: "Manual adjustment by an admin" };
    default:
      return { direction: "in", source: entry.type };
  }
};

// What actually happened to this money, in the words a person would use.
// `Transaction.status` only says pending/success/failed, which doesn't
// distinguish money arriving from money leaving — "success" reads the same on
// a top-up and a withdrawal.
const statusLabel = (entry) => {
  if (entry.status === "failed") return "failed";
  if (entry.status === "pending") {
    return entry.type === "withdrawal" ? "withdrawal pending" : "pending";
  }
  switch (entry.type) {
    case "topup": return "loaded";
    case "payment": return "paid";
    case "earning": return "received";
    case "commission": return "earned";
    case "withdrawal": return "withdrawn";
    case "refund": return "refunded";
    case "adjustment": return "adjusted";
    default: return entry.status;
  }
};

/**
 * A wallet's movements with a plain-language origin for each one.
 *
 * `viewer` only changes the wording ("your eSewa account" vs "a user's"), not
 * what's returned — access is decided by the caller before getting here.
 */
export const buildStatement = async (walletId, { limit = 100, viewer = "user" } = {}) => {
  const entries = await Transaction.find({ wallet: walletId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate({
      path: "relatedBooking",
      select: "serviceType workshop user vehicle",
      populate: [
        { path: "workshop", select: "name" },
        { path: "user", select: "firstname lastname" },
        { path: "vehicle", select: "plateNumber" },
      ],
    })
    .lean();

  return entries.map((entry) => {
    const { direction, source } = describe(entry, viewer);
    return {
      _id: entry._id,
      type: entry.type,
      amount: entry.amount,
      status: entry.status,
      statusLabel: statusLabel(entry),
      gateway: entry.gateway,
      createdAt: entry.createdAt,
      direction,
      source,
      bookingId: entry.relatedBooking?._id ?? null,
    };
  });
};

// Totals by movement type — "where the money came from" as a summary rather
// than a list. Only successful entries count; a failed top-up is not income.
export const summariseStatement = (entries) => {
  const byType = {};
  let inTotal = 0;
  let outTotal = 0;

  for (const e of entries) {
    if (e.status !== "success") continue;
    byType[e.type] = (byType[e.type] ?? 0) + e.amount;
    if (e.direction === "in") inTotal += e.amount;
    else outTotal += e.amount;
  }

  return { byType, inTotal, outTotal };
};
