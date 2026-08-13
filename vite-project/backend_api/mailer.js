import nodemailer from "nodemailer";

const requiredVars = ["GMAIL_USER", "GMAIL_APP_PASSWORD"];
const missing = requiredVars.filter((v) => !process.env[v]);
if (missing.length) {
  throw new Error(
    `Missing Gmail SMTP env vars: ${missing.join(", ")}. Make sure the root .env is loaded before route imports.`
  );
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Same call shape as the old @sendgrid/mail sgMail.send(), so callers don't need to change.
const mailer = {
  send: ({ to, from, subject, html, text }) =>
    transporter.sendMail({ to, from: from || process.env.GMAIL_USER, subject, html, text }),
};

export default mailer;
