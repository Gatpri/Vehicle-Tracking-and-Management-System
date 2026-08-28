import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getIO } from "../config/socket.js";
import { canAccessConversation, roomsForConversation } from "../services/chatChannels.js";

/**
 * Load a message the caller is allowed to modify, or explain why not.
 *
 * Only the sender may edit or unsend their own message — not an admin
 * answering the thread, and not a full admin overseeing it. Rewriting
 * somebody else's words is a different power from reading them, and nothing
 * in this product needs it.
 */
const loadOwnMessage = async (user, messageId) => {
  const message = await Message.findById(messageId);
  if (!message) return { error: "Message not found" };
  if (!message.sender.equals(user._id)) return { error: "You can only change your own messages" };
  if (message.deletedAt) return { error: "That message was already deleted" };
  return { message };
};

export const registerChatHandlers = (socket) => {
  socket.on("chat:join", async (conversationId, ack) => {
    try {
      const convo = await Conversation.findById(conversationId);
      if (!convo) return ack?.({ success: false, message: "Conversation not found" });

      // Same check the REST route uses, deliberately shared rather than
      // reimplemented: a socket that could join a room the REST route would
      // refuse is a hole that only shows up under load, never in testing.
      const allowed = await canAccessConversation(socket.user, convo);
      if (!allowed) return ack?.({ success: false, message: "Forbidden" });

      socket.join(`chat:${conversationId}`);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  socket.on("message:send", async ({ conversationId, text }, ack) => {
    try {
      // Validated and trimmed here, exactly as the REST twin (sendMessage)
      // and message:edit below already do. This is the path the UI actually
      // uses, and it was the only one of the three that accepted anything:
      // Message.text is deliberately not `required` (unsend blanks it), so a
      // whitespace-only send was persisted as a real message and rendered as
      // an empty bubble nobody could explain.
      const body = String(text ?? "").trim();
      if (!body) return ack?.({ success: false, message: "A message cannot be empty" });

      const convo = await Conversation.findById(conversationId);
      if (!convo) return ack?.({ success: false, message: "Conversation not found" });

      const allowed = await canAccessConversation(socket.user, convo);
      if (!allowed) return ack?.({ success: false, message: "Forbidden" });

      const message = await Message.create({ conversation: conversationId, sender: socket.user._id, text: body });
      convo.lastMessageAt = new Date();
      await convo.save();

      // For a channel thread this also reaches the answering admins' per-user
      // rooms, so a new support message arrives without them having opened the
      // thread first.
      //
      // Emitted as ONE call listing every room, not a loop of one call each.
      // A socket is routinely in two of these at once — `chat:<id>` because it
      // opened the thread, and `user:<id>` because it is in the audience — and
      // a per-room loop delivers the message once per matching room, so the
      // sender sees their own message twice. A single `.to(a).to(b)` emit
      // deduplicates recipients internally, which is exactly the guarantee
      // needed here.
      const rooms = await roomsForConversation(convo);
      getIO().to(rooms).emit("message:new", message);

      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  /**
   * Edit a message, within EDIT_WINDOW_MS of sending it.
   *
   * The previous text is pushed onto editHistory rather than overwritten, so
   * a reader can expand an edited message and see what it said before — which
   * is the point of marking it "edited" at all.
   */
  socket.on("message:edit", async ({ messageId, text }, ack) => {
    try {
      const body = String(text ?? "").trim();
      if (!body) return ack?.({ success: false, message: "A message cannot be empty" });

      const { message, error } = await loadOwnMessage(socket.user, messageId);
      if (error) return ack?.({ success: false, message: error });

      // Re-checked here rather than trusting the client's own clock, which is
      // both wrong sometimes and adjustable deliberately.
      if (!message.isEditable()) {
        return ack?.({
          success: false,
          message: "Messages can only be edited within 3 minutes of sending",
        });
      }

      // Editing to the identical text would otherwise add a meaningless
      // history entry and mark the message "edited" for no visible reason.
      if (body === message.text) return ack?.({ success: true, message });

      const now = new Date();
      message.editHistory.push({ text: message.text, editedAt: now });
      message.text = body;
      message.editedAt = now;
      await message.save();

      const convo = await Conversation.findById(message.conversation);
      const rooms = await roomsForConversation(convo);
      getIO().to(rooms).emit("message:updated", message);

      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  /**
   * Unsend a message. Allowed at any time — you can always retract your own
   * words — but the row stays behind as a "deleted" placeholder rather than
   * vanishing, so replies that answered it still make sense.
   */
  socket.on("message:unsend", async ({ messageId }, ack) => {
    try {
      const { message, error } = await loadOwnMessage(socket.user, messageId);
      if (error) return ack?.({ success: false, message: error });

      message.deletedAt = new Date();
      // Blanked, not merely flagged: leaving the text in place would let
      // anyone reading the raw API response recover what was "deleted".
      message.text = "";
      // The history is what the text used to be, so it goes too.
      message.editHistory = [];
      await message.save();

      const convo = await Conversation.findById(message.conversation);
      const rooms = await roomsForConversation(convo);
      getIO().to(rooms).emit("message:updated", message);

      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });
};
