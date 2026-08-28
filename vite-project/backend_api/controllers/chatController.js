import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Workshop from "../models/Workshop.js";
import ServiceRequest from "../models/ServiceRequest.js";
import { ADMIN_ROLES, isAdminRole } from "../policies/permissions.js";
import { FULL_ADMIN_ROLES } from "../constants/chatAudiences.js";
import { getIO } from "../config/socket.js";
import {
  availableChannelsFor,
  getOrCreateChannelThread,
  canAccessConversation,
  visibleConversationsFilter,
  roomsForConversation,
  labelConversation,
  pruneCustomerConversations,
} from "../services/chatChannels.js";

/**
 * Who may read a thread they are not part of and whose audience they are not in.
 *
 * Deliberately NOT chat:read:any. That permission is held by every staff role
 * — delivery-staff included, where its stated purpose is "lets them message a
 * customer about a delay" — so treating it as a read-anything override let a
 * delivery-staff or tracking-admin open any customer's support thread. It
 * grants the ability to *start* conversations, not to read other people's.
 *
 * Oversight of the whole platform is a full-admin power, so that is the check.
 */
const canOverseeAllChats = (user) => FULL_ADMIN_ROLES.includes(user.role);

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
    // Customers no longer open direct threads at all. They write to a group
    // channel ("Customer Support", "Vehicle Tracking", a workshop), so one
    // message reaches everyone who can answer it instead of depending on which
    // individual admin they happened to pick off a list. Without this guard
    // the old one-to-one threads would simply reappear.
    //
    // Staff keep the direct path: a workshop-admin asking one customer about
    // the vehicle in front of them is a genuinely private, two-person
    // conversation and has no group equivalent.
    if (req.user.role === "user") {
      return res.status(400).json({
        success: false,
        message: "Use a support channel instead of messaging an admin directly",
      });
    }

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

/**
 * The channels this user may open a thread on — "Customer Support", "Vehicle
 * Tracking", each workshop, or their regional delivery-admin thread.
 *
 * Served from the backend rather than hardcoded per client so the web app and
 * the mobile app cannot disagree about who may talk to whom.
 */
export const listChannels = async (req, res) => {
  try {
    const channels = await availableChannelsFor(req.user);
    res.json({ success: true, channels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** Open (or reopen) this user's thread on a channel. */
export const openChannel = async (req, res) => {
  try {
    const { channel, workshopId } = req.body;
    const conversation = await getOrCreateChannelThread(req.user, { channel, workshopId });

    // A brand-new room is unknown to every socket that is already connected,
    // including the answering admins'. Pull them in now so the first message
    // arrives live rather than only after a refresh.
    const rooms = await roomsForConversation(conversation);
    rooms
      .filter((r) => r.startsWith("user:"))
      .forEach((r) => getIO().in(r).socketsJoin(`chat:${conversation._id}`));

    res.status(201).json({ success: true, conversation });
  } catch (err) {
    // These are user-facing refusals ("You cannot open that channel"), not
    // server faults, so they answer 400 rather than 500.
    res.status(400).json({ success: false, message: err.message });
  }
};

export const listConversations = async (req, res) => {
  try {
    const filter = req.query.all === "true" && canOverseeAllChats(req.user)
      ? {}
      : await visibleConversationsFilter(req.user);

    const conversations = await Conversation.find(filter)
      .populate("participants", "firstname lastname email role")
      .populate("owner", "firstname lastname email role")
      .populate("workshop", "name")
      .sort({ lastMessageAt: -1 });

    // A customer's list shows only the workshops they have actually talked to.
    // Support and Vehicle Tracking already sit permanently under "Start a
    // chat", so repeating them here says nothing new — see
    // pruneCustomerConversations for the whole rule.
    const visible = await pruneCustomerConversations(req.user, conversations);

    // Channel threads have no second participant to name them after, so the
    // label is computed per viewer — see labelConversation.
    const withLabels = visible.map((c) => ({
      ...c.toObject(),
      label: labelConversation(c, req.user),
    }));

    res.json({ success: true, conversations: withLabels });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    // workshop is populated so the thread can name itself — a customer who
    // arrives here by deep link from a workshop page has no list row to read
    // the garage's name off, since an unused thread is not listed yet.
    const conversation = await Conversation.findById(req.params.id)
      .populate("owner", "firstname lastname email role")
      .populate("workshop", "name");
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

    // canAccessConversation covers both kinds: participants for a direct
    // thread, and the derived role audience for a channel thread.
    const allowed = await canAccessConversation(req.user, conversation);
    if (!allowed && !canOverseeAllChats(req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const { limit = 50, before } = req.query;
    const filter = { conversation: conversation._id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    // editHistory rides along for everyone who can read the thread, not just
    // the author: that is what makes the "edited" marker meaningful, since a
    // recipient can check a message was not rewritten after they replied.
    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200));
    res.json({
      success: true,
      messages: messages.reverse(),
      conversationLabel: labelConversation(conversation, req.user),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * REST fallbacks for editing and unsending, alongside the primary
 * "message:edit" / "message:unsend" socket paths.
 *
 * The rules live in one place: only the sender may change their own message,
 * edits expire after EDIT_WINDOW_MS, and unsending soft-deletes rather than
 * removing the row. Duplicating those checks between here and the socket
 * handler is how the two drift, so both call the same model helpers and both
 * broadcast the same "message:updated" event.
 */
const loadOwnMessageForWrite = async (user, messageId) => {
  const message = await Message.findById(messageId);
  if (!message) return { status: 404, error: "Message not found" };
  if (!message.sender.equals(user._id)) {
    return { status: 403, error: "You can only change your own messages" };
  }
  if (message.deletedAt) return { status: 400, error: "That message was already deleted" };
  return { message };
};

const broadcastUpdate = async (message) => {
  const conversation = await Conversation.findById(message.conversation);
  const rooms = await roomsForConversation(conversation);
  getIO().to(rooms).emit("message:updated", message);
};

export const editMessage = async (req, res) => {
  try {
    const body = String(req.body.text ?? "").trim();
    if (!body) return res.status(400).json({ success: false, message: "A message cannot be empty" });

    const { message, error, status } = await loadOwnMessageForWrite(req.user, req.params.messageId);
    if (error) return res.status(status).json({ success: false, message: error });

    if (!message.isEditable()) {
      return res.status(400).json({
        success: false,
        message: "Messages can only be edited within 3 minutes of sending",
      });
    }
    if (body === message.text) return res.json({ success: true, message });

    const now = new Date();
    message.editHistory.push({ text: message.text, editedAt: now });
    message.text = body;
    message.editedAt = now;
    await message.save();

    await broadcastUpdate(message);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const unsendMessage = async (req, res) => {
  try {
    const { message, error, status } = await loadOwnMessageForWrite(req.user, req.params.messageId);
    if (error) return res.status(status).json({ success: false, message: error });

    message.deletedAt = new Date();
    // Blanked, not merely flagged — see the model's own note.
    message.text = "";
    message.editHistory = [];
    await message.save();

    await broadcastUpdate(message);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// REST fallback alongside the primary "message:send" socket path.
export const sendMessage = async (req, res) => {
  try {
    // Trimmed, not just checked — the socket path and message:edit both store
    // the trimmed body, and storing the raw string here would make the same
    // message look different depending on which path sent it.
    const body = String(req.body.text ?? "").trim();
    if (!body) return res.status(400).json({ success: false, message: "text is required" });

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

    const allowed = await canAccessConversation(req.user, conversation);
    if (!allowed) return res.status(403).json({ success: false, message: "Forbidden" });

    const message = await Message.create({ conversation: conversation._id, sender: req.user._id, text: body });
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // A channel thread reaches its audience's per-user rooms as well as the
    // thread room — the answering admins may never have opened it, so they
    // were never in `chat:<id>`.
    //
    // One emit listing every room, not a loop: a socket in both `chat:<id>`
    // and `user:<id>` would otherwise receive the message once per room. See
    // the same note in sockets/chatHandlers.js.
    const rooms = await roomsForConversation(conversation);
    getIO().to(rooms).emit("message:new", message);
    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
