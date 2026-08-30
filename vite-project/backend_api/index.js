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

// CORS origins.
//
// The hard problem this solves: the SAME backend is called by the web app and
// by the Expo app, and the web app alone is reachable at several different
// origins — http://localhost (nginx on :80), http://localhost:5173 (Vite dev),
// and both of those again on this machine's LAN IP so a phone or a second
// computer can reach them. A single FRONTEND_URL cannot describe all of that,
// and DHCP changes the LAN IP without warning.
//
// A static list therefore goes stale in a way that is painful to diagnose:
// fixing the origin for mobile would drop the one the web app was using and
// vice versa, so logging in appeared to break on one client every time the
// other was fixed. The failure is silent — a credentialed request whose Origin
// is not matched simply gets no Access-Control-Allow-Origin header back, and
// the browser reports a generic network error rather than a CORS problem.
//
// So development accepts any origin on loopback or a private LAN range,
// whatever port it is on, and production keeps a strict explicit allowlist.
// `credentials: true` is only ever honoured against a specific origin (never a
// wildcard), which is why this is a function returning the caller's origin
// rather than "*".
const STATIC_ORIGINS = [
  process.env.EXPO_WEB_URL,
  process.env.FRONTEND_URL,
  process.env.BACKEND_BASE_URL,
].filter(Boolean);

// RFC1918 private ranges plus loopback. A public address never matches, so
// this cannot be used to reach the API from the open internet.
const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

// NODE_ENV is "production" inside the container even during local development
// (Dockerfile.backend sets it), so it cannot be the switch here — using it
// would disable LAN access in exactly the setup that needs it. ALLOW_LAN_CORS
// is opt-out instead: set it to "false" for a real deployment.
const allowLanOrigins = process.env.ALLOW_LAN_CORS !== "false";

const isPrivateOrigin = (origin) => {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "http:" && PRIVATE_HOST.test(hostname);
  } catch {
    return false; // unparseable Origin header
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    // No Origin header at all: same-origin navigations, curl, native mobile
    // (iOS/Android send none). These are not browser cross-origin requests, so
    // there is nothing for CORS to protect against.
    if (!origin) return callback(null, true);
    if (STATIC_ORIGINS.includes(origin)) return callback(null, true);
    if (allowLanOrigins && isPrivateOrigin(origin)) return callback(null, true);
    // Rejecting by returning false, not an Error: an Error here becomes a 500
    // and hides the real cause. false simply omits the CORS headers, which is
    // the correct, spec-defined "not allowed" response.
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
  // Must list every custom header a client actually sends: a preflight that
  // does not echo one back makes the browser block the request outright, which
  // surfaces in the app as "cannot reach the server" rather than as a CORS
  // error. The native app sends x-client on every request (config/clientKind.js)
  // and Authorization once signed in, since its session is a bearer token
  // rather than the browser's cookie.
  allowedHeaders: ["Content-Type", "Authorization", "x-client"],
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















