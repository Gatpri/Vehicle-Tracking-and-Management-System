import "./env.js";
import http from "http";
import express from "express";
import cors  from "cors";
import { connectDB } from "./db.js";
import signupRoutes from "./routes/signup.js";
import loginRoutes from "./routes/login.js"
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
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json());

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


















/*import "./env.js";
import express from "express";
import cors  from "cors";
import { connectDB } from "./db.js";
import signupRoutes from "./routes/signup.js";
import loginRoutes from "./routes/login.js"
import recoverRoutes from "./routes/password_recover.js";
import googleAuthRoutes from "./routes/google_auth_signup.js";
import protectedRoutes from "./routes/protectedRoutes.js";
import mongoose from "mongoose";


// ---- CHANGED: modular firebase-admin imports instead of default `admin` ----
import { initializeApp, cert, getApps } from "firebase-admin/app";
// ------

// Initialize Firebase Admin from environment variables
let firebaseAdminInitialized = false;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // Check if already initialized
    if (!admin.apps || admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.cert({
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
} 
catch (error) {
  console.error('❌ Firebase Admin initialization error:', error.message);
  console.warn('Google Auth will not work without Firebase Admin credentials.');
}
//............................
console.log("Firebase apps after init:", getApps().length);


// Export admin for use in other files
export { firebaseAdminInitialized };

const app = express();

//middleware

// Configure CORS properly for Firebase authentication
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Set COOP header for Google Auth popup to work
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json());

//connectDB
 await connectDB();

 //routes
 app.use("/", signupRoutes)
 app.use("/", loginRoutes)
 app.use("/", recoverRoutes);
 app.use("/", googleAuthRoutes);
 app.use("/", protectedRoutes);

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
*/