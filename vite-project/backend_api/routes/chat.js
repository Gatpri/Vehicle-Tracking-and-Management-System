import express from "express";
import { verifyToken } from "../middleware/auth.js";
import {
  getOrCreateConversation,
  listConversations,
  getMessages,
  sendMessage,
  listSupportAdmins,
  listMyWorkshopCustomers,
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/chat/support-admins", verifyToken, listSupportAdmins);
router.get("/chat/my-customers", verifyToken, listMyWorkshopCustomers);
router.post("/chat/conversations", verifyToken, getOrCreateConversation);
router.get("/chat/conversations", verifyToken, listConversations);
router.get("/chat/conversations/:id/messages", verifyToken, getMessages);
router.post("/chat/conversations/:id/messages", verifyToken, sendMessage);

export default router;
