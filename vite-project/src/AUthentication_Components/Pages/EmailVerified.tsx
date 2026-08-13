import { useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import "../../home_components/Styles/home.css";
import "../styles/EmailVerified.css";

// Long enough for the success message to actually be read before the page
// moves itself to home.
const REDIRECT_DELAY_MS = 3000;

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="8" x2="12" y2="13" />
    <line x1="12" y1="16.5" x2="12" y2="16.51" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const CONTENT: Record<string, { ok: boolean; title: string; text: string }> = {
  success: {
    ok: true,
    title: "Email Verified!",
    text: "Your account is confirmed and ready to go. Welcome to VeriTrack — your vehicle's complete digital guardian.",
  },
  expired: {
    ok: false,
    title: "Link Expired",
    text: "That verification link has expired. Please register again to receive a fresh one.",
  },
  invalid: {
    ok: false,
    title: "Invalid Link",
    text: "That verification link isn't valid. Please register again to receive a fresh one.",
  },
  error: {
    ok: false,
    title: "Something Went Wrong",
    text: "We couldn't verify your email right now. Please try registering again.",
  },
};

function EmailVerified() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get("status") || "error";
  const { ok, title, text } = CONTENT[status] ?? CONTENT.error;

  // On success, announce it and send this tab to home on its own. This is the
  // tab the email client opened, which may well be a different browser from
  // the one used to sign up — so it can't rely on the signup tab's polling.
  useEffect(() => {
    if (!ok) return;

    toast.success("Account created successfully!");
    const timer = setTimeout(() => navigate("/"), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ok, navigate]);

  return (
    <div className="uh">
      <div className="ev-page">
        <div className="ev-card">
          <div className="uh-logo ev-logo">
            <span className="uh-logo-mark">V</span>
            VeriTrack<span className="uh-logo-accent">.</span>
          </div>

          <div className={`ev-icon ${ok ? "ev-icon-success" : "ev-icon-error"}`}>
            {ok ? <IconCheck /> : <IconAlert />}
          </div>

          <h1 className="ev-title">{title}</h1>
          <p className="ev-text">{text}</p>

          {ok ? (
            <>
              <Link to="/" className="uh-btn uh-btn-primary uh-btn-lg">Go to Home</Link>
              <p className="ev-redirect-note">Taking you to the home page…</p>
            </>
          ) : (
            <Link to="/signin" className="uh-btn uh-btn-primary uh-btn-lg">Register Again</Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailVerified;
