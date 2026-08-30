import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import PendingUser from "../models/PendingUser.js";
import mailer from "../mailer.js";
import crypto from "crypto";
import { body, validationResult } from "express-validator";


const router = express.Router();

// Cloudflare quick-tunnel URLs are regenerated every run, so a stale value in
// .env silently produces verification links pointing at a host that no longer
// resolves. Fall back to localhost so plain `npm run dev` works untouched;
// only override when a tunnel is actually up.
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:3000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// How long a verification link stays valid. Five minutes was too tight in
// practice: on a phone the user has to leave the app, wait for the mail to
// arrive, find it (often in spam) and open it — and an expired link silently
// discards the signup, so the account is simply never created. Thirty minutes
// covers that without leaving unverified rows around for long; the TTL index
// on PendingUser.expiresAt still clears them automatically.
const VERIFY_WINDOW_MIN = 30;

//for inputvalidation and sanititization
const userValidationRules= [
 body('firstname').notEmpty().withMessage('First name is required').isLength({ max: 50 }).withMessage('First name must be under 50 characters'),
 body('lastname').notEmpty().withMessage('Last name is required').isLength({ max: 50 }).withMessage('Last name must be under 50 characters'),
 body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format'),
 body('password').notEmpty().withMessage('Password is required').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
]



//user submits form -> store in pendingUsers with expiry (5min) -> send verification email with token link -> on click, verify token, create user in DB, delete from pendingUsers

// API route
router.post("/register", userValidationRules, async (req, res) => {
  try {
/*node security best practices: validate input, check for existing user, hash password, generate unique token, store pending user with expiry, send verification email*/


const errors = validationResult(req);
if (!errors.isEmpty()) {
  return res.status(400).json({ errors: errors.array() });
}


    const { firstname, lastname, email, password } = req.body;


    /*if(!firstname || !lastname || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }*/

 const existingUser = await User.findOne({email });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
  



    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex"); // random unique token

    await PendingUser.create({
      token,
      firstname,
      lastname,
      email,
      password: hashedPassword,
      expiresAt: new Date(Date.now() + VERIFY_WINDOW_MIN * 60 * 1000),
    });

      // Send verification email.
    // `client` rides along on the link so the verify handler knows whether to
    // redirect into the React SPA (browser signup) or render its own
    // self-contained page (phone signup, where the Vite dev server is not
    // something the device can be relied on to reach).
    const client = req.get("x-client") === "mobile" ? "mobile" : "web";
    const link = `${BACKEND_BASE_URL}/api/verify-email?token=${token}&client=${client}&email=${encodeURIComponent(email)}`;
    await mailer.send({
      to: email,
      from: "saugatkapri@gmail.com",       
      subject: "Verify your email",
      // A styled anchor plus the bare URL underneath. Mobile mail clients are
      // the reason for the second copy: some render a plain <a> as untappable
      // text, and the user is then left with an email that appears to contain
      // no link at all. The visible URL can always be copied by hand.
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f1e3a">
          <h2 style="margin:0 0 12px">Welcome to Vehicle Safety!</h2>
          <p style="color:#475569;line-height:1.6">Tap the button below to verify your email address and finish creating your account.</p>
          <p style="margin:28px 0">
            <a href="${link}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;display:inline-block;font-weight:600">Verify my email</a>
          </p>
          <p style="color:#475569;line-height:1.6;font-size:14px">If the button doesn't work, copy this address into your browser:</p>
          <p style="word-break:break-all;font-size:13px;color:#1d4ed8">${link}</p>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px">This link expires in ${VERIFY_WINDOW_MIN} minutes.</p>
        </div>
      `,
      text: `Welcome to Vehicle Safety!

Verify your email address by opening this link:
${link}

This link expires in ${VERIFY_WINDOW_MIN} minutes.`,
    });

    res.json({
      success: true,
      message: "Confirmation link sent! Please check your email.",
    });

  }
  

  catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});



// Polled by the "check your email" screen so the original tab can detect
// verification and move itself to /login, without relying on the user to
// switch back from whatever tab the email link opened in.
router.get("/registration-status", async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ verified: false, message: "Email is required" });
  }
  const user = await User.findOne({ email }).select("_id");
  res.json({ verified: !!user });
});

// Rendered to whoever clicked the link in the email. A phone opens that link
// in Safari/Gmail's browser, which has no session and — during development —
// often cannot reach the Vite dev server at all. So the mobile flow gets a
// complete, self-contained page served straight off the backend; only the
// browser flow redirects into the React SPA's /email-verified route.
const RESULT_COPY = {
  success: {
    icon: "✓",
    accent: "#16a34a",
    title: "Email Verified!",
    text: "Your account is confirmed. Return to the Vehicle Safety app — you can sign in now.",
  },
  expired: {
    icon: "!",
    accent: "#d97706",
    title: "Link Expired",
    text: `That verification link is older than ${VERIFY_WINDOW_MIN} minutes. Please register again to get a fresh one.`,
  },
  invalid: {
    icon: "!",
    accent: "#dc2626",
    title: "Invalid Link",
    text: "That verification link isn't valid. Please register again to receive a fresh one.",
  },
  error: {
    icon: "!",
    accent: "#dc2626",
    title: "Something Went Wrong",
    text: "We couldn't verify your email right now. Please try registering again.",
  },
};

const renderResultPage = (status) => {
  const { icon, accent, title, text } = RESULT_COPY[status] || RESULT_COPY.error;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         padding:24px; }
  .card { background:#fff; border-radius:20px; padding:40px 28px; max-width:380px; width:100%;
          text-align:center; box-shadow:0 10px 40px rgba(15,30,58,.12); }
  .badge { width:72px; height:72px; border-radius:50%; margin:0 auto 20px; display:flex;
           align-items:center; justify-content:center; font-size:36px; font-weight:700;
           color:#fff; background:${accent}; }
  h1 { margin:0 0 12px; font-size:23px; color:#0f1e3a; }
  p { margin:0; color:#475569; line-height:1.6; font-size:15px; }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">${icon}</div>
    <h1>${title}</h1>
    <p>${text}</p>
  </div>
</body>
</html>`;
};

// Browser signups keep bouncing to the SPA's /email-verified route (no
// dead-end backend page); mobile signups get the page above.
const finishVerification = (res, client, status) => {
  if (client === "mobile") {
    return res.status(200).type("html").send(renderResultPage(status));
  }
  return res.redirect(`${FRONTEND_URL}/email-verified?status=${status}`);
};

router.get("/verify-email", async (req, res) => {
  const client = req.query.client === "mobile" ? "mobile" : "web";
  try {
    const { token } = req.query;
    const record = await PendingUser.findOne({ token });

    if (!record) {
      // A second tap of the same link lands here, because the pending row was
      // deleted by the first one — and mail clients prefetch links, so this is
      // routine rather than rare. Look the account up by the email carried on
      // the link: if it exists the verification already succeeded, and saying
      // "invalid" would tell a user with a perfectly good account that
      // something went wrong. Only a token matching no account at all is
      // genuinely invalid.
      const { email } = req.query;
      if (email) {
        const existing = await User.findOne({ email }).select("_id");
        if (existing) return finishVerification(res, client, "success");
      }
      return finishVerification(res, client, "invalid");
    }

    if (Date.now() > record.expiresAt.getTime()) {
      await PendingUser.deleteOne({ token });
      return finishVerification(res, client, "expired");
    }

    // Guard the unique index on User.email: a second click of the same link,
    // or a signup racing an existing account, would otherwise throw a
    // duplicate-key error and show "Something went wrong" to a user whose
    // account is in fact already verified and usable.
    const alreadyVerified = await User.findOne({ email: record.email }).select("_id");
    if (!alreadyVerified) {
      await User.create({
        firstname: record.firstname,
        lastname: record.lastname,
        email: record.email,
        password: record.password,
      });
    }

    await PendingUser.deleteOne({ token }); // cleanup

    return finishVerification(res, client, "success");
  }
  catch(err){
    console.error("verify-email failed:", err);
    return finishVerification(res, client, "error");
  }
});




export default router;
 