import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import mailer from "../mailer.js";
import crypto from "crypto";
import { body, validationResult } from "express-validator";


const router = express.Router();




const pendingUsers = {}; // { email: { data, expiresAt } }

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


    pendingUsers[token]={
      firstname,
      lastname,
      email,
      password: hashedPassword,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
    }

      // Send verification email
    const link = `${process.env.BACKEND_BASE_URL}/verify-email?token=${token}`;
    await mailer.send({
      to: email,
      from: "saugatkapri@gmail.com",       
      subject: "Verify your email",
      html: `
        <h2>We are pleased to welcome you in our community!</h2>
        <p>Click the link below to verify your email address:</p>
        <a href="${link}">Verify my email</a>
        <p>This link expires in 5 minutes.</p>
      `,
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

const FRONTEND_URL = process.env.FRONTEND_URL;

// After verification link is clicked, land the user on a dedicated
// /email-verified result page (no dead-end backend page, and no bouncing
// through /login) — the status param drives which message it shows.
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    const record = pendingUsers[token];

    if (!record) {
      return res.redirect(`${FRONTEND_URL}/email-verified?status=invalid`);
    }

    if (Date.now() > record.expiresAt) {
      delete pendingUsers[token];
      return res.redirect(`${FRONTEND_URL}/email-verified?status=expired`);
    }

    //create user in database
    await User.create({
      firstname: record.firstname,
      lastname: record.lastname,
      email: record.email,
      password: record.password,
    });

    delete pendingUsers[token]; // cleanup

    res.redirect(`${FRONTEND_URL}/email-verified?status=success`);
  }
  catch(err){
    res.redirect(`${FRONTEND_URL}/email-verified?status=error`);
  }
});




export default router;
 