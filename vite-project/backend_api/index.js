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

await connectDB();

app.use("/", signupRoutes)
app.use("/", loginRoutes)
app.use("/", recoverRoutes);
app.use("/", googleAuthRoutes);
app.use("/", protectedRoutes);
app.use("/", vehicleRoutes);
app.use("/", workshopRoutes);
app.use("/", bookingRoutes);
app.use("/", trackingRoutes);
app.use("/", deliveryRoutes);
app.use("/", deliveryStaffRoutes);
app.use("/", cctvRoutes);
app.use("/", cameraRoutes);
app.use("/", chatRoutes);
app.use("/", walletRoutes);
app.use("/", sosRoutes);
app.use("/", theftRoutes);
app.use("/", notificationRoutes);
app.use("/", quoteRoutes);

const httpServer = http.createServer(app);
const io = initSocket(httpServer, corsOptions);
registerHandlers(io);

httpServer.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});

startCameraPoller();


















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