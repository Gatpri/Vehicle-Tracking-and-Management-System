import mongoose from "mongoose";

// One line of a quote. `selected` is what the customer controls: the workshop
// proposes the list, the customer decides which parts they actually want, and
// the total follows from that rather than from a number either side typed.
const QuoteItemSchema = new mongoose.Schema({
  part: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 }, // paisa, like every other price here
  selected: { type: Boolean, default: true },
}, { _id: false });

// A single round of the negotiation. Revisions are appended, never edited, so
// the quote carries its own audit trail: who proposed what, when, and what the
// customer struck out. That history is also what the vehicle service record
// reads to show which parts were actually replaced.
const RevisionSchema = new mongoose.Schema({
  items: { type: [QuoteItemSchema], default: [] },
  // "workshop" revisions propose; "customer" revisions are the same list with
  // selections changed.
  authorRole: { type: String, enum: ["workshop", "customer"], required: true },
  // What this round of the conversation actually was. Distinguishing an
  // enquiry from an acceptance is the whole point: a customer asking "is the
  // air filter really needed?" must not be read as agreeing to the price.
  action: {
    type: String,
    enum: [
      "estimate",            // workshop proposed a list
      "reply",               // workshop answered a question, list unchanged
      "confirm",             // workshop agreed the customer's acceptance
      "accept-selection",    // customer agreed, but only for the parts they kept
      "accept-as-estimated", // customer agreed to the workshop's full list
      "enquiry",             // customer asked something, agreeing to nothing
    ],
    required: true,
  },
  // Which estimate this belongs to. A garage that opens the engine and finds
  // more work sends a fresh round rather than reopening a settled one.
  round: { type: Number, default: 1 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  note: { type: String, default: "", maxlength: 1000 },
  // A spoken note — easier than typing part names on a phone in a workshop,
  // and it crosses the language barrier that written Nepali/English can raise.
  voiceUrl: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const PartsQuoteSchema = new mongoose.Schema({
  serviceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ServiceRequest",
    required: true,
    unique: true,
    index: true,
  },
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  revisions: { type: [RevisionSchema], default: [] },
  status: {
    type: String,
    // awaiting-customer: workshop proposed or replied, customer's move
    // awaiting-workshop: customer accepted or asked something, workshop's move
    // accepted: the current round is settled and its total is committed
    enum: ["awaiting-customer", "awaiting-workshop", "accepted", "cancelled"],
    default: "awaiting-customer",
  },
  currentRound: { type: Number, default: 1 },
  // What the customer has agreed to but the workshop hasn't confirmed yet.
  // Kept here rather than inferred from the last revision so the workshop can
  // see the exact figure it's being asked to commit to.
  pendingAcceptance: {
    total: { type: Number, default: null },
    mode: { type: String, enum: ["selection", "as-estimated", null], default: null },
    at: { type: Date, default: null },
  },
  // Sum of every round both sides have confirmed. Later rounds stack on top of
  // this rather than replacing it — a garage finding more work mid-job adds to
  // the bill, it doesn't renegotiate what was already agreed.
  agreedTotal: { type: Number, default: 0 },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

// The live figure for the current round: selected lines of the newest
// revision. Always derived, so no stored total can disagree with its lines.
PartsQuoteSchema.methods.currentTotal = function currentTotal() {
  const latest = this.revisions[this.revisions.length - 1];
  if (!latest) return 0;
  return latest.items.filter((i) => i.selected).reduce((sum, i) => sum + i.price, 0);
};

// Everything on the workshop's list for this round, whether the customer kept
// it or not — the "accept as estimated" figure.
PartsQuoteSchema.methods.fullTotal = function fullTotal() {
  const latest = this.revisions[this.revisions.length - 1];
  if (!latest) return 0;
  return latest.items.reduce((sum, i) => sum + i.price, 0);
};

PartsQuoteSchema.methods.latestRevision = function latestRevision() {
  return this.revisions[this.revisions.length - 1] ?? null;
};

const PartsQuote = mongoose.model("PartsQuote", PartsQuoteSchema);
export default PartsQuote;
