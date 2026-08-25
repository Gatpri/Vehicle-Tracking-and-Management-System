import express from "express";
import { verifyToken } from "../middleware/auth.js";
import {
  getOrCreateConversation,
  listConversations,
  getMessages,
  sendMessage,
  listSupportAdmins,
  listMyWorkshopCustomers,
  listChannels,
  openChannel,
  editMessage,
  unsendMessage,
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/chat/support-admins", verifyToken, listSupportAdmins);
router.get("/chat/my-customers", verifyToken, listMyWorkshopCustomers);

// Group channels: who this user may write to, and opening their thread on one.
// Registered before the /chat/conversations routes so "channels" is never
// mistaken for a conversation id.
router.get("/chat/channels", verifyToken, listChannels);
router.post("/chat/channels/open", verifyToken, openChannel);
router.post("/chat/conversations", verifyToken, getOrCreateConversation);
router.get("/chat/conversations", verifyToken, listConversations);
router.get("/chat/conversations/:id/messages", verifyToken, getMessages);
router.post("/chat/conversations/:id/messages", verifyToken, sendMessage);

// Editing and unsending. Addressed by message id rather than nested under a
// conversation: a message belongs to exactly one thread, so the conversation
// in the path would be redundant and could disagree with the message's own.
router.patch("/chat/messages/:messageId", verifyToken, editMessage);
router.delete("/chat/messages/:messageId", verifyToken, unsendMessage);

export default router;
