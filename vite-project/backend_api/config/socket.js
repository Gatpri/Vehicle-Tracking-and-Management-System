import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";

let io = null;

export const initSocket = (httpServer, corsOptions) => {
  io = new Server(httpServer, { cors: corsOptions });

  // Same verification as middleware/auth.js's verifyToken, adapted for the
  // handshake — a socket connection is authenticated once, up front.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key-change-this");
      const user = await User.findOne({ email: decoded.email }).select("-password");
      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    socket.join(`user:${socket.user._id}`);
    if (socket.user.role === "admin" || socket.user.role === "superadmin") {
      socket.join("admins");
    }

    // Join every conversation room this user is already part of, so a
    // "message:new" broadcast reaches them without requiring they've
    // manually opened that thread first (io.to(room) only reaches sockets
    // that have actually joined it — a fresh connection otherwise wouldn't
    // hear about a conversation it hasn't opened yet).
    const conversations = await Conversation.find({ participants: socket.user._id }).select("_id");
    conversations.forEach((c) => socket.join(`chat:${c._id}`));
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
};
