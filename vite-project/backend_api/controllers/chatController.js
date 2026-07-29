import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { hasPermission } from "../policies/permissions.js";
import { getIO } from "../config/socket.js";

const canReadAny = (user) => hasPermission(user.role, "chat:read:any", user.permissions);

// Any authenticated user can see who support is — needed so a regular user
// has someone to start a conversation with (they have no permission to hit
// the admin-only /admins listing).
export const listSupportAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ["admin", "superadmin"] } }).select("firstname lastname role");
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getOrCreateConversation = async (req, res) => {
  try {
    const { recipientId, bookingId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ success: false, message: "recipientId is required" });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient || (recipient.role !== "admin" && recipient.role !== "superadmin")) {
      return res.status(400).json({ success: false, message: "recipientId must be an admin" });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user._id, recipientId], $size: 2 },
      ...(bookingId && { relatedBooking: bookingId }),
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, recipientId],
        relatedBooking: bookingId || null,
      });

      // The recipient's socket (if already connected) has no way to know
      // this brand-new room exists — connect-time auto-join only covers
      // conversations that existed before they connected. Pull their
      // current sockets into the room immediately so the first message
      // still reaches them live instead of only after a refresh.
      const room = `chat:${conversation._id}`;
      getIO().in(`user:${recipientId}`).socketsJoin(room);
      getIO().in(`user:${req.user._id}`).socketsJoin(room);
    }

    res.status(201).json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listConversations = async (req, res) => {
  try {
    const filter = req.query.all === "true" && canReadAny(req.user)
      ? {}
      : { participants: req.user._id };

    const conversations = await Conversation.find(filter)
      .populate("participants", "firstname lastname email role")
      .sort({ lastMessageAt: -1 });
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

    const isParticipant = conversation.participants.some((p) => p.equals(req.user._id));
    if (!isParticipant && !canReadAny(req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const { limit = 50, before } = req.query;
    const filter = { conversation: conversation._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200));
    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// REST fallback alongside the primary "message:send" socket path.
export const sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: "text is required" });

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

    const isParticipant = conversation.participants.some((p) => p.equals(req.user._id));
    if (!isParticipant) return res.status(403).json({ success: false, message: "Forbidden" });

    const message = await Message.create({ conversation: conversation._id, sender: req.user._id, text });
    conversation.lastMessageAt = new Date();
    await conversation.save();

    getIO().to(`chat:${conversation._id}`).emit("message:new", message);
    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
