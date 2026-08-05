import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Workshop from "../models/Workshop.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { hasPermission, ADMIN_ROLES, isAdminRole } from "../policies/permissions.js";
import { getIO } from "../config/socket.js";

const canReadAny = (user) => hasPermission(user.role, "chat:read:any", user.permissions);

// True when `candidateId` has an actual booking at a workshop this user
// manages. Deliberately checks bookings rather than role: it's the existing
// business relationship that earns the right to make contact, not the job title.
const isMyWorkshopCustomer = async (user, candidateId) => {
  if (user.role !== "workshop-admin" && user.role !== "admin") return false;
  const managed = await Workshop.find({ managedBy: user._id }).select("_id");
  if (managed.length === 0) return false;
  const booking = await ServiceRequest.findOne({
    user: candidateId,
    workshop: { $in: managed.map((w) => w._id) },
  }).select("_id");
  return Boolean(booking);
};

// Any authenticated user can see who support is — needed so a regular user
// has someone to start a conversation with (they have no permission to hit
// the admin-only /admins listing). Staff use the same list to reach each
// other, so the caller is excluded: nobody needs to message themselves.
export const listSupportAdmins = async (req, res) => {
  try {
    // delivery-admin isn't in ADMIN_ROLES (it doesn't join the general
    // "admins" broadcast room) but should still be contactable in support
    // chat, so it's added here explicitly rather than widening ADMIN_ROLES.
    const admins = await User.find({
      role: { $in: [...ADMIN_ROLES, "delivery-admin"] },
      _id: { $ne: req.user._id },
    }).select("firstname lastname role");
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Customers a workshop-admin may open a thread with: everyone who has booked
// at a garage they manage. Powers the "Message a customer" picker.
export const listMyWorkshopCustomers = async (req, res) => {
  try {
    const managed = await Workshop.find({ managedBy: req.user._id }).select("_id");
    if (managed.length === 0) return res.json({ success: true, customers: [] });

    const bookings = await ServiceRequest.find({ workshop: { $in: managed.map((w) => w._id) } })
      .populate("user", "firstname lastname email")
      .select("user serviceType createdAt")
      .sort({ createdAt: -1 });

    // One entry per person, keeping their most recent job for context.
    const seen = new Map();
    for (const booking of bookings) {
      if (!booking.user || seen.has(String(booking.user._id))) continue;
      seen.set(String(booking.user._id), {
        _id: booking.user._id,
        firstname: booking.user.firstname,
        lastname: booking.user.lastname,
        lastService: booking.serviceType,
      });
    }

    res.json({ success: true, customers: [...seen.values()] });
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

    if (String(recipientId) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You can't start a conversation with yourself" });
    }

    // Conversations open toward staff, which is what keeps a regular user
    // un-contactable until they reach out first.
    //
    // The one exception: a workshop-admin may open a thread with someone who
    // booked at their garage. That's a customer they're already holding a
    // vehicle for, so the "no cold-messaging strangers" rule isn't what's
    // protecting anyone there — and without it a garage can't ask about the
    // job in front of them.
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ success: false, message: "Recipient not found" });
    }
    if (!isAdminRole(recipient.role) && !(await isMyWorkshopCustomer(req.user, recipientId))) {
      return res.status(400).json({ success: false, message: "You can only start a conversation with staff" });
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
