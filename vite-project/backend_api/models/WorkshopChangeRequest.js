import mongoose from "mongoose";

// A workshop-admin's proposed edit to their own garage, held for an
// admin/superadmin to approve.
//
// Workshop-admins can no longer write to a Workshop directly: the services
// table is what customers are billed against, so a price change has to be
// somebody else's decision. The proposed document is stored whole rather than
// as a diff — approving is then just "apply these fields", with no chance of a
// half-applied edit if the workshop moved on in the meantime.
const WorkshopChangeRequestSchema = new mongoose.Schema({
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // The fields the requester wants to end up with. Only keys present here are
  // applied on approval — anything absent is left as-is on the workshop.
  proposed: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  // What those fields looked like when the request was raised, so a reviewer
  // can see what actually changes without guessing, and so an approval that
  // lands late is still explainable.
  snapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  // Why it was turned down, so the workshop-admin can act on the answer
  // instead of resubmitting the same thing.
  reviewNote: { type: String, default: "" },
}, { timestamps: true });

// At most one open request per workshop: a second would make "approve"
// ambiguous about which proposal wins.
WorkshopChangeRequestSchema.index(
  { workshop: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

const WorkshopChangeRequest = mongoose.model("WorkshopChangeRequest", WorkshopChangeRequestSchema);
export default WorkshopChangeRequest;
