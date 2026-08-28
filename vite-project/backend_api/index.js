import "./env.js";
import http from "http";
import express from "express";
import cors  from "cors";
import cookieParser from "cookie-parser";
import { connectDB } from "./db.js";
import signupRoutes from "./routes/signup.js";
import loginRoutes from "./routes/login.js"
import sessionRoutes from "./routes/session.js";
import recoverRoutes from "./routes/password_recover.js";
import googleAuthRoutes from "./routes/google_auth_signup.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import vehicleRoutes from "./routes/vehicles.js";
import workshopRoutes from "./routes/workshops.js";
import bookingRoutes from "./routes/bookings.js";
import trackingRoutes from "./routes/tracking.js";
import deliveryRoutes from "./routes/deliveries.js";
import deliveryStaffRoutes from "./routes/deliveryStaff.js";
import cctvRoutes from "./routes/cctv.js";
import cameraRoutes from "./routes/cameras.js";
import chatRoutes from "./routes/chat.js";
import walletRoutes from "./routes/wallet.js";
import sosRoutes from "./routes/sos.js";
import theftRoutes from "./routes/theft.js";
import notificationRoutes from "./routes/notifications.js";
import quoteRoutes from "./routes/quotes.js";
import mongoose from "mongoose";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { initSocket } from "./config/socket.js";
import { registerHandlers } from "./sockets/index.js";
import { startCameraPoller } from "./services/cameraPollerService.js";
import { startBookingAutoComplete } from "./services/bookingAutoComplete.js";

let firebaseAdminInitialized = false;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
      });
      firebaseAdminInitialized = true;
      console.log('✅ Firebase Admin initialized successfully');
    }
  } else {
    console.warn('⚠️ Firebase Admin credentials not found in .env file');
    console.log("PID:", process.env.FIREBASE_PROJECT_ID);
    console.log("EMAIL:", process.env.FIREBASE_CLIENT_EMAIL);
    console.log("KEY exists:", !!process.env.FIREBASE_PRIVATE_KEY);
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization error:', error.message);
  console.warn('Google Auth will not work without Firebase Admin credentials.');
}

console.log("Firebase apps after init:", getApps().length);

export { firebaseAdminInitialized };

const app = express();

// All external traffic now arrives via nginx (see docker-compose.yml/
// nginx.conf), so req.ip must come from the X-Forwarded-For header nginx
// sets, not the raw socket peer (which would always be nginx's own address —
// making every request look like it came from the same IP for rate-limiting
// purposes like login.js's per-IP lockout).
app.set("trust proxy", true);

// FRONTEND_URL is included here too so CORS automatically follows whatever
// it's set to (a Cloudflare tunnel URL for cross-device access, or
// localhost for same-machine dev) without a second place to edit.
// `credentials: true` is what lets the browser send the session cookie on
// cross-origin calls, and it is only honoured against an explicit origin
// allowlist — never a wildcard. Authorization is gone from allowedHeaders:
// nothing sends it any more now that the session travels in a cookie.
// "http://localhost" (and 127.0.0.1) are port 80 — the nginx frontend in
// docker-compose, which is what you get browsing to plain http://localhost.
// They're listed explicitly because FRONTEND_URL points at the LAN IP, and a
// credentialed request whose Origin isn't matched here gets no
// Access-Control-Allow-Origin back, so the browser blocks the login outright.
const corsOptions = {
  origin: [
    "http://localhost",
    "http://127.0.0.1",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    // The Expo web build, which Metro serves on 8081. That is the same
    // codebase as the iOS/Android apps, run in a browser; it calls this API
    // cross-origin because Metro does not proxy /api the way nginx does for
    // vite-project.
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    // A phone or a second machine opening the Expo web build over the LAN
    // sends its own host as the Origin, which cannot be known at build time.
    // Set EXPO_WEB_URL (e.g. http://192.168.254.28:8081) when that is needed.
    process.env.EXPO_WEB_URL,
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json());

// Populates req.cookies, which middleware/auth.js reads the session from.
// Must be registered before any route that authenticates.
app.use(cookieParser());

app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

await connectDB();

// Mounted under /api so nginx can proxy every browser-facing call through
// port 80/443 regardless of which host/IP the browser used to reach the
// frontend — a bare "/" mount meant every client had to hardcode the
// backend's own host:port directly, which only ever worked from the Docker
// host itself. /health stays unprefixed: Docker's healthcheck curls it
// from inside the container, never through nginx.
app.use("/api", signupRoutes)
app.use("/api", loginRoutes)
app.use("/api", sessionRoutes);
app.use("/api", recoverRoutes);
app.use("/api", googleAuthRoutes);
app.use("/api", protectedRoutes);
app.use("/api", vehicleRoutes);
app.use("/api", workshopRoutes);
app.use("/api", bookingRoutes);
app.use("/api", trackingRoutes);
app.use("/api", deliveryRoutes);
app.use("/api", deliveryStaffRoutes);
app.use("/api", cctvRoutes);
app.use("/api", cameraRoutes);
app.use("/api", chatRoutes);
app.use("/api", walletRoutes);
app.use("/api", sosRoutes);
app.use("/api", theftRoutes);
app.use("/api", notificationRoutes);
app.use("/api", quoteRoutes);

const httpServer = http.createServer(app);
const io = initSocket(httpServer, corsOptions);
registerHandlers(io);

httpServer.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});

startCameraPoller();
startBookingAutoComplete();















