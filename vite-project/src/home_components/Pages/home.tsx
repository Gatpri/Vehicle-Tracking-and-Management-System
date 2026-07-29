import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../Styles/home.css";
import heroImg from "../../assets/hero.png";

interface CurrentUser {
  _id?: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
}

const IconWrench = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);
const IconNavigation = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);
const IconCamera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
const IconScan = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);
const IconStore = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l1.2-5h15.6L21 9" />
    <path d="M4 9v10a1 1 0 0 0 1 1h4v-6h6v6h4a1 1 0 0 0 1-1V9" />
    <path d="M3 9h18" />
  </svg>
);
const IconShieldAlert = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="13" />
    <line x1="12" y1="16.5" x2="12" y2="16.51" />
  </svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-4.5 7.4 8.5 8.5 0 0 1-8.9-.5L3 20l1.6-4.4A8.4 8.4 0 0 1 3 11.5a8.5 8.5 0 0 1 8.5-8.5h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
const IconWallet = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="13" rx="2" />
    <path d="M16 6V4.8A1.8 1.8 0 0 0 14.2 3H4a2 2 0 0 0-2 2v1" />
    <circle cx="17" cy="12.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
const IconSiren = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="16.5" x2="12" y2="16.51" />
  </svg>
);
const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconStar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.8 5.9 21l1.5-6.8-5.2-4.7 6.9-.7L12 2.5z" />
  </svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const IconMapPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const features = [
  { icon: <IconWrench />, title: "Service & Repair Booking", desc: "Schedule maintenance or repairs with trusted workshops in just a few taps, and track every job to completion." },
  { icon: <IconNavigation />, title: "Real-Time Vehicle Tracking", desc: "Know exactly where your vehicle is at all times with live location updates on an interactive map." },
  { icon: <IconCamera />, title: "Live CCTV Detection", desc: "Our connected camera network scans traffic in real time to spot your vehicle automatically." },
  { icon: <IconScan />, title: "AI Plate Recognition", desc: "Advanced number-plate recognition flags lost or stolen vehicles the moment they're seen." },
  { icon: <IconStore />, title: "Smart Workshop Matching", desc: "Get personalized workshop recommendations based on distance, ratings, and pricing history." },
  { icon: <IconShieldAlert />, title: "Overpricing Alerts", desc: "AI compares quotes against market rates and warns you before you overpay for a service." },
  { icon: <IconChat />, title: "Direct Chat Support", desc: "Message your workshop or an admin directly and keep every conversation in one place." },
  { icon: <IconWallet />, title: "Digital Wallet", desc: "Pay for services securely from an in-app wallet — no cash, no card details shared." },
  { icon: <IconSiren />, title: "Emergency SOS", desc: "One tap alerts nearby help and shares your live location during a breakdown or emergency." },
];

const steps = [
  { n: "01", title: "Register Your Vehicle", desc: "Add your vehicle's plate number and details so our system can recognize it instantly across the network." },
  { n: "02", title: "Get Matched & Monitored", desc: "We recommend nearby trusted workshops while our CCTV and AI network keeps a quiet eye on your vehicle." },
  { n: "03", title: "Track, Chat & Pay", desc: "Follow every repair live, chat directly with your workshop, and pay securely from your digital wallet." },
];

function Home() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  const currentUser: CurrentUser | null = stored ? JSON.parse(stored) : null;
  const token = localStorage.getItem("token");
  const [menuOpen, setMenuOpen] = useState(false);

  // Direct-access guard: this page is only reachable after a real login.
  // Hitting /home in the browser without a session bounces straight to /login.
  useEffect(() => {
    if (!currentUser || !token) {
      navigate("/login", { replace: true });
    }
  }, [currentUser, token, navigate]);

  if (!currentUser || !token) return null;

  const initials = `${currentUser.firstname?.[0] ?? ""}${currentUser.lastname?.[0] ?? ""}`.toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="uh">
      {/* Navbar */}
      <header className="uh-nav">
        <div className="uh-nav-inner">
          <div className="uh-logo">
            <span className="uh-logo-mark">V</span>
            VeriTrack<span className="uh-logo-accent">.</span>
          </div>

          <nav className={`uh-links ${menuOpen ? "open" : ""}`}>
            <Link to="/vehicles" onClick={() => setMenuOpen(false)}>Vehicles</Link>
            <Link to="/bookings" onClick={() => setMenuOpen(false)}>Bookings</Link>
            <Link to="/wallet" onClick={() => setMenuOpen(false)}>Wallet</Link>
            <Link to="/chat" onClick={() => setMenuOpen(false)}>Chat</Link>
            <Link to="/sos" onClick={() => setMenuOpen(false)} style={{ color: "var(--orange-500)", fontWeight: 700 }}>SOS</Link>

            <div className="uh-links-mobile-user">
              <button className="uh-btn uh-btn-outline" onClick={handleLogout}>Logout</button>
            </div>
          </nav>

          <div className="uh-nav-right">
            <div className="uh-user">
              <span className="uh-user-name">Hi, {currentUser.firstname}</span>
              <span className="uh-avatar">{initials}</span>
              <button className="uh-btn uh-btn-outline" onClick={handleLogout}>Logout</button>
            </div>
          </div>

          <button className="uh-burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Toggle menu">
            {menuOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="uh-hero">
        <div className="uh-hero-inner">
          <div className="uh-hero-copy">
            <span className="uh-eyebrow">
              <span className="uh-dot" /> Live tracking &nbsp;·&nbsp; AI-powered &nbsp;·&nbsp; Monitored 24/7
            </span>
            <h1>
              Your Vehicle's Complete <span className="uh-highlight">Digital Guardian</span>
            </h1>
            <p className="uh-hero-sub">
              Book trusted repairs, track your vehicle in real time, and get instant AI-powered
              alerts the moment something needs attention — all from one dashboard.
            </p>
            <div className="uh-hero-cta">
              <button className="uh-btn uh-btn-primary uh-btn-lg" onClick={() => navigate("/workshops")}>
                Book a Service <IconArrowRight />
              </button>
              <button className="uh-btn uh-btn-ghost uh-btn-lg" onClick={() => navigate("/vehicles")}>
                Track My Vehicle
              </button>
            </div>
            <div className="uh-trust">
              <span className="uh-stars"><IconStar /><IconStar /><IconStar /><IconStar /><IconStar /></span>
              <span>4.9/5 rating &nbsp;·&nbsp; 50+ partner workshops &nbsp;·&nbsp; 10,000+ vehicles protected</span>
            </div>
          </div>

          <div className="uh-hero-art">
            <div className="uh-blob uh-blob-blue" />
            <div className="uh-blob uh-blob-orange" />
            <div className="uh-hero-frame">
              <img src={heroImg} alt="Vehicle service dashboard preview" />
              <div className="uh-chip uh-chip-top">
                <span className="uh-live-dot" /> Live · Vehicle Located
              </div>
              <div className="uh-chip uh-chip-bottom">
                <IconWrench /> Service due in 12 days
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="uh-stats">
        <div className="uh-stats-inner">
          <div className="uh-stat"><strong>10,000+</strong><span>Vehicles Protected</span></div>
          <div className="uh-stat"><strong>50+</strong><span>Partner Workshops</span></div>
          <div className="uh-stat"><strong>24/7</strong><span>Real-Time Monitoring</span></div>
          <div className="uh-stat"><strong>98%</strong><span>Theft Recovery Rate</span></div>
        </div>
      </section>

      {/* Features */}
      <section className="uh-section" id="services">
        <div className="uh-section-head">
          <span className="uh-kicker">Platform</span>
          <h2>Everything your vehicle needs, in one place</h2>
          <p>From routine maintenance to real-time security, VeriTrack keeps you covered end to end.</p>
        </div>
        <div className="uh-grid">
          {features.map((f) => (
            <div className="uh-card" key={f.title}>
              <div className="uh-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="uh-section uh-section-alt" id="how-it-works">
        <div className="uh-section-head">
          <span className="uh-kicker">Process</span>
          <h2>How it works</h2>
          <p>Three simple steps between you and complete peace of mind.</p>
        </div>
        <div className="uh-steps">
          {steps.map((s, i) => (
            <div className="uh-step" key={s.n}>
              <div className="uh-step-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < steps.length - 1 && <div className="uh-step-line" />}
            </div>
          ))}
        </div>
      </section>

      {/* AI Security Showcase */}
      <section className="uh-ai" id="ai-security">
        <div className="uh-ai-inner">
          <div className="uh-ai-copy">
            <span className="uh-kicker uh-kicker-light">AI Security</span>
            <h2>AI eyes everywhere, watching over what matters</h2>
            <p>
              A connected network of CCTV feeds and AI plate recognition works quietly in the
              background — spotting lost or stolen vehicles and flagging suspicious activity
              before it becomes a problem.
            </p>
            <ul className="uh-ai-list">
              <li><IconCheck /> Real-time number plate recognition across camera networks</li>
              <li><IconCheck /> Instant theft alerts sent straight to your phone</li>
              <li><IconCheck /> Public theft heatmap to stay aware in high-risk areas</li>
              <li><IconCheck /> Overpricing detection to keep repair quotes honest</li>
            </ul>
            <button className="uh-btn uh-btn-primary">
              See How It Works <IconArrowRight />
            </button>
          </div>

          <div className="uh-ai-panel">
            <div className="uh-feed">
              <div className="uh-feed-header">
                <span className="uh-live-dot" /> CAM 04 · Ring Road Junction
              </div>
              <div className="uh-feed-body">
                <div className="uh-scan-line" />
                <div className="uh-bbox">
                  <span className="uh-bbox-label">Vehicle Detected</span>
                </div>
              </div>
              <div className="uh-feed-readout">
                <span>Plate: <strong>BA 12 PA 3456</strong></span>
                <span className="uh-match">✓ Match Found</span>
              </div>
            </div>
            <div className="uh-heatmap-card">
              <IconMapPin />
              <div>
                <strong>Theft Heatmap</strong>
                <span>3 incidents reported nearby this week</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="uh-cta">
        <div className="uh-cta-inner">
          <h2>Ready to give your vehicle the protection it deserves?</h2>
          <p>Join thousands of drivers who trust VeriTrack for service, tracking, and security.</p>
          <button className="uh-btn uh-btn-cta" onClick={() => navigate("/vehicles")}>
            Get Started Free <IconArrowRight />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="uh-footer" id="footer">
        <div className="uh-footer-inner">
          <div className="uh-footer-brand">
            <div className="uh-logo uh-logo-footer">
              <span className="uh-logo-mark">V</span>
              VeriTrack<span className="uh-logo-accent">.</span>
            </div>
            <p>Smart vehicle service, tracking, and security — powered by AI and a connected CCTV network.</p>
          </div>
          <div className="uh-footer-col">
            <h4>Product</h4>
            <a href="#services">Services</a>
            <a href="#ai-security">AI Security</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#">Digital Wallet</a>
          </div>
          <div className="uh-footer-col">
            <h4>Company</h4>
            <a href="#">About Us</a>
            <a href="#">Careers</a>
            <a href="#">Contact</a>
          </div>
          <div className="uh-footer-col">
            <h4>Support</h4>
            <a href="#">Help Center</a>
            <a href="#">Emergency SOS</a>
            <a href="#">Report an Issue</a>
          </div>
        </div>
        <div className="uh-footer-bottom">
          <span>© {new Date().getFullYear()} VeriTrack. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

export default Home;
