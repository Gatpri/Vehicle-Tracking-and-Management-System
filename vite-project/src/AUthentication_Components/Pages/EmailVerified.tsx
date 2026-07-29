import { useSearchParams, Link } from "react-router-dom";
import "../../home_components/Styles/home.css";
import "../styles/EmailVerified.css";

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
  const status = searchParams.get("status") || "error";
  const { ok, title, text } = CONTENT[status] ?? CONTENT.error;

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
            <Link to="/login" className="uh-btn uh-btn-primary uh-btn-lg">Continue to Login</Link>
          ) : (
            <Link to="/signin" className="uh-btn uh-btn-primary uh-btn-lg">Register Again</Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmailVerified;
