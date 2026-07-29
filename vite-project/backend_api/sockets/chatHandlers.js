import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getIO } from "../config/socket.js";

export const registerChatHandlers = (socket) => {
  socket.on("chat:join", async (conversationId, ack) => {
    try {
      const convo = await Conversation.findById(conversationId);
      if (!convo) return ack?.({ success: false, message: "Conversation not found" });

      const isParticipant = convo.participants.some((p) => p.equals(socket.user._id));
      if (!isParticipant) return ack?.({ success: false, message: "Forbidden" });

      socket.join(`chat:${conversationId}`);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });

  socket.on("message:send", async ({ conversationId, text }, ack) => {
    try {
      const convo = await Conversation.findById(conversationId);
      if (!convo) return ack?.({ success: false, message: "Conversation not found" });

      const isParticipant = convo.participants.some((p) => p.equals(socket.user._id));
      if (!isParticipant) return ack?.({ success: false, message: "Forbidden" });

      const message = await Message.create({ conversation: conversationId, sender: socket.user._id, text });
      convo.lastMessageAt = new Date();
      await convo.save();

      getIO().to(`chat:${conversationId}`).emit("message:new", message);
      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, message: err.message });
    }
  });
};
