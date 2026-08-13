
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { JWT_SECRET } from "../config/jwt.js";

const router = express.Router();

router.post("/google-auth", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: "No ID token provided" });
  }

  if (!getApps().length) {
    console.error("❌ No Firebase app initialized");
    return res.status(500).json({ success: false, message: "Firebase Admin not initialized on server" });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const { email, name, picture } = decodedToken;

    let user = await User.findOne({ email });

    if (!user) {
      const [firstname, ...lastnameParts] = (name || "Google User").split(" ");
      const lastname = lastnameParts.join(" ") || " ";

      user = await User.create({
        firstname,
        lastname,
        email,
        password: "GOOGLE_AUTH_USER",
        role: "user",
      });
    }

    const jwtToken = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role,
        permissions: user.permissions,
      }
    });
  }
  catch (err) {
    console.error("❌ Google Auth Error:", err.message || err);
    res.status(401).json({ success: false, message: "Invalid Token: " + (err.message || err) });
  }
});

export default router;














// import express from "express";
// import jwt from "jsonwebtoken";
// import User from "../models/User.js";
// import admin from "firebase-admin";

// const router = express.Router();

// router.post("/google-auth", async (req, res) => {
//   const { idToken } = req.body;

//   if (!idToken) {
//     return res.status(400).json({ success: false, message: "No ID token provided" });
//   }

//   try {
//     console.log('[Google Auth] Token received, verifying...');
//     // Verify the token with Google/Firebase
//     const decodedToken = await admin.auth().verifyIdToken(idToken);
//     console.log('[Google Auth] Token verified for email:', decodedToken.email);
//     const { email, name, picture } = decodedToken;

//     // Check if user exists in MongoDB
//     let user = await User.findOne({ email });

//     if (!user) {
//       // Splitting name
//       const [firstname, ...lastnameParts] = name.split(" ");
//       const lastname = lastnameParts.join(" ") || " ";

//       user = await User.create({
//         firstname,
//         lastname,
//         email,
//         password: "GOOGLE_AUTH_USER",
//         role: "user",
//       });
//       console.log('[Google Auth] New user created with role: user');
//     } else {
//       console.log('[Google Auth] Existing user found with role:', user.role);
//     }

//     // Generate JWT token for protected routes
//     const jwtToken = jwt.sign(
//       { userId: user._id, email: user.email, role: user.role },
//       process.env.JWT_SECRET || "your-secret-key-change-this",
//       { expiresIn: "24h" }
//     );

//     res.json({
//       success: true,
//       token: jwtToken,
//       user: {
//         id: user._id,
//         email: user.email,
//         firstname: user.firstname,
//         lastname: user.lastname,
//         role: user.role,
//         permissions: user.permissions,
//       }
//     });
//   } 
//   catch (err) {
//     console.error("❌ Google Auth Error:", err.message || err);
//     res.status(401).json({ success: false, message: "Invalid Token: " + (err.message || err) });
//   }
// });

// export default router;