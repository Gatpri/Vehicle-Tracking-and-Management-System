import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { isAdminRole, hasPermission } from "../policies/permissions.js";
import { JWT_SECRET } from "./jwt.js";
import { SESSION_COOKIE } from "./cookies.js";
import { parseCookie } from "cookie";

let io = null;

export const initSocket = (httpServer, corsOptions) => {
  io = new Server(httpServer, { cors: corsOptions });

  // Same verification as middleware/auth.js's verifyToken, adapted for the
  // handshake — a socket connection is authenticated once, up front.
  //
  // The token comes from the session cookie on the handshake request, which
  // the browser attaches by itself, rather than from `handshake.auth` — the
  // client can no longer read the token to put it there, which is the whole
  // point of the cookie being httpOnly.
  io.use(async (socket, next) => {
    try {
      // Browsers send the session as a cookie on the handshake request and
      // cannot read it to put anywhere else. Native clients have no such
      // cookie, so they pass the token in `handshake.auth.token` instead —
      // checked only after the cookie, so on the web the cookie still wins.
      const cookies = parseCookie(socket.handshake.headers?.cookie || "");
      const authToken = socket.handshake.auth?.token;
      const token = cookies[SESSION_COOKIE] || (typeof authToken === "string" ? authToken : null);
      if (!token) return next(new Error("Not authenticated"));

      const decoded = jwt.verify(token, JWT_SECRET);
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
    if (isAdminRole(socket.user.role)) {
      socket.join("admins");
    }
    // Separate room so a new withdrawal pings only the people who action them,
    // rather than every admin on the platform.
    if (hasPermission(socket.user.role, "withdrawal:review", socket.user.permissions)) {
      socket.join("accounting");
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
