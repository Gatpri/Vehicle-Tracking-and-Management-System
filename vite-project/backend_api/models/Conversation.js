import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  relatedBooking: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceRequest", default: null },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });

const Conversation = mongoose.model("Conversation", ConversationSchema);
export default Conversation;
