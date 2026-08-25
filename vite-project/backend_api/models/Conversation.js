import mongoose from "mongoose";

/**
 * A conversation is one of two kinds:
 *
 *   direct  — the original two-person thread. A workshop-admin asking one
 *             customer about the vehicle in front of them, say. Reached by
 *             `participants` alone.
 *
 *   channel — a support thread owned by one person but answered by a *group*.
 *             "Customer Support" reaches every admin and superadmin;
 *             "Vehicle Tracking" reaches the tracking admins; a workshop
 *             channel reaches whoever manages that garage. The audience is
 *             derived from `channel` at read time rather than stored as a
 *             participant list, so an admin hired tomorrow can answer a thread
 *             opened today without anyone editing old documents.
 *
 * Channel threads are deliberately one-per-owner, not one shared room: two
 * customers must never read each other's messages, which is the whole reason
 * a support desk has threads at all.
 */

/** Audiences a channel thread can be answered by. */
export const CHANNEL_KINDS = {
  /** Every admin + superadmin. Opened by customers, staff, anyone. */
  SUPPORT: "support",
  /** vehicle-tracking-admin (plus full admins, who see everything). */
  TRACKING: "tracking",
  /** The admins managing one specific workshop — see `workshop`. */
  WORKSHOP: "workshop",
  /** Other delivery-admins in the owner's region — see `region`. */
  DELIVERY_REGION: "delivery-region",
};

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },

  /**
   * Null for a direct thread. Set for a channel thread, naming which group
   * answers it.
   */
  channel: {
    type: String,
    enum: [...Object.values(CHANNEL_KINDS), null],
    default: null,
    index: true,
  },

  /**
   * Whose thread this is — the person who opened it and the only non-staff
   * participant. Channel threads are looked up by (owner, channel), which is
   * what keeps one customer's support thread separate from another's.
   */
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

  /** Which garage, for CHANNEL_KINDS.WORKSHOP. */
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", default: null },

  /**
   * Which region, for CHANNEL_KINDS.DELIVERY_REGION. Stored as written, and
   * always compared through utils/region.js — real data has "chitwan" on one
   * account and "Chitwan" on another.
   */
  region: { type: String, default: "" },

  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });

// The lookup every channel thread does: "does this person already have a
// thread on this channel?" Partial so direct threads (channel: null) don't
// collide with each other on a null owner.
ConversationSchema.index(
  { owner: 1, channel: 1, workshop: 1 },
  { partialFilterExpression: { channel: { $type: "string" } } }
);

const Conversation = mongoose.model("Conversation", ConversationSchema);
export default Conversation;
