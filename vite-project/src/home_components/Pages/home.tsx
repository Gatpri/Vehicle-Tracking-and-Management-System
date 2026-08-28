import { useCallback, useEffect, useState } from "react";
import { primeSpeech } from "../../lib/speak";
import { Link, useNavigate } from "react-router-dom";
import "../Styles/home.css";
import heroImg from "../../assets/hero.png";
import { useAuth } from "../../lib/AuthContext";
import { BOOKING_STATUS_LABELS } from "../../lib/bookingWorkflow";
import HowItWorksDemo from "./HowItWorksDemo";
import ServicingDemo from "./ServicingDemo";
import HowItWorksChooser from "./HowItWorksChooser";
import { useHomeData } from "./useHomeData";

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

const IconCog = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

/** The servicing pillar, mirroring the AI-security list beside it. */

/**
 * Stages drawn on the job-card rail. These are display groupings, not raw
 * statuses: the workflow has ~18 states and showing them all would be noise,
 * so each stage lights up once the booking reaches any status inside it.
 */
const JOB_STAGES: Array<{ key: string; label: string; matches: string[] }> = [
  { key: "booked", label: "Booked", matches: ["pending", "accepted", "delivery-requested", "delivery-assigned", "out-for-delivery", "picked-up"] },
  { key: "diagnosis", label: "Diagnosis", matches: ["dropped", "servicing-started"] },
  { key: "estimate", label: "Estimate", matches: ["estimation-pending", "estimation-confirmed"] },
  { key: "repair", label: "Repair", matches: ["payment-pending", "payment-completed"] },
  { key: "ready", label: "Ready", matches: ["completed", "return-assigned", "delivery-reassigned", "return-picked-from-workshop", "delivered", "finished"] },
];

/**
 * Cycles the job card through the workflow when there is nothing live to show.
 *
 * With a real booking the card mirrors it exactly and never animates — the
 * status of your own vehicle must not appear to move on its own. It is only
 * the empty state that demonstrates the sequence, which is otherwise a row of
 * five grey dots that explains nothing.
 */
function useDemoStage(active: boolean): number {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Pauses a beat on the last stage before looping, so "Ready" registers as
    // an ending rather than flicking straight back to the start.
    const id = window.setInterval(() => setI((n) => (n + 1) % (JOB_STAGES.length + 1)), 1600);
    return () => window.clearInterval(id);
  }, [active]);

  return Math.min(i, JOB_STAGES.length - 1);
}

/** Mirrors the scene list in ServicingDemo. */
const SERVICING_FLOW = [
  "Choose a workshop and book",
  "A rider collects your vehicle",
  "It reaches the workshop",
  "The mechanic inspects and quotes",
  "You approve the parts list",
  "You pay, and only then repair begins",
  "The vehicle is returned to you",
];

/** Mirrors the scene list in HowItWorksDemo. */
const AI_FLOW = [
  "You register your vehicle once",
  "If it is stolen, you press SOS",
  "Cameras watch every vehicle passing",
  "The plate is read from the frame",
  "It is matched against the search list",
  "You and the admins are alerted",
];

/** Fixed sample values for the Service Job Card illustration. Deliberately not
 *  the reader's own vehicle: the card animates through every stage, and a real
 *  plate on a looping rail would read as their booking changing status. */
const SAMPLE_JOB = { plate: "BA 12 PA 3456", workshop: "Bikers Moto" };

/** The service types the platform supports, as labels. Fixed rather than read
 *  from the workshops API so this panel stays a stable illustration. */
const SAMPLE_SERVICES = ["Full Servicing", "Oil Change", "Parts Replacement", "Modification"];

const features = [
  { icon: <IconWrench />, title: "Service & Repair Booking", desc: "Schedule maintenance or repairs with trusted workshops in just a few taps, and track every job to completion.", to: "/bookings" },
  { icon: <IconNavigation />, title: "Real-Time Vehicle Tracking", desc: "Know exactly where your vehicle is at all times with live location updates on an interactive map.", to: "/vehicles" },
  { icon: <IconScan />, title: "AI Plate Recognition", desc: "Advanced number-plate recognition flags lost or stolen vehicles the moment they're seen.", to: "/safety" },
  { icon: <IconStore />, title: "Smart Workshop Matching", desc: "Get personalized workshop recommendations based on distance, ratings, and pricing history.", to: "/workshops" },
  { icon: <IconChat />, title: "Direct Chat Support", desc: "Message your workshop or an admin directly and keep every conversation in one place.", to: "/chat" },
  { icon: <IconWallet />, title: "Digital Wallet", desc: "Pay for services securely from an in-app wallet — no cash, no card details shared.", to: "/wallet" },
  { icon: <IconSiren />, title: "Emergency SOS", desc: "One tap alerts nearby help and shares your live location during a breakdown or emergency.", to: "/sos" },
];


function Home() {
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showServicing, setShowServicing] = useState(false);
  // The footer link covers both halves of the product, so it opens a
  // chooser first rather than assuming which one was meant.
  const [showChooser, setShowChooser] = useState(false);

  // Everything shown in the hero and stat band is this user's own data.
  const home = useHomeData();

  const closeDemo = useCallback(() => setShowDemo(false), []);
  const closeServicing = useCallback(() => setShowServicing(false), []);

  // Must sit above the early return below: hooks run in the same order on
  // every render, so calling this after a conditional return breaks that rule.
  //
  // Always running, whether or not a booking is live. The card's job here is to
  // SHOW the workflow — a rail frozen on "Booked" explains nothing about the
  // four stages after it. The reader's actual status is not faked by this: it
  // is printed verbatim in the card's footer, next to their plate.
  const demoStage = useDemoStage(true);

  // Access is decided by the route's ProtectedRoute wrapper (customers only) —
  // this page is never rendered without a valid customer session, so it needs
  // no guard of its own. The null check below is a type narrowing, not a gate.
  if (!currentUser) return null;

  const initials = `${currentUser.firstname?.[0] ?? ""}${currentUser.lastname?.[0] ?? ""}`.toUpperCase();
  const stolenCount = home.vehicles.filter((v) => v.status === "stolen").length;
  // Jobs the workshop has signed off but whose vehicle has not come back yet.
  const awaitingReturn = home.activeBookings.length - home.inProgressBookings.length;
  const nextBooking = home.inProgressBookings[0] ?? home.activeBookings[0] ?? null;

  const handleLogout = async () => {
    // Server-side: only the backend can clear the httpOnly session cookie.
    await logout();
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
            <Link to="/vehicles" onClick={() => setMenuOpen(false)}>Register Vehicles</Link>
            <Link to="/bookings" onClick={() => setMenuOpen(false)}>Bookings</Link>
            <Link to="/workshops" onClick={() => setMenuOpen(false)}>Workshops</Link>
            <Link to="/wallet" onClick={() => setMenuOpen(false)}>Wallet</Link>
            <Link to="/chat" onClick={() => setMenuOpen(false)}>Chat</Link>
            <Link to="/safety" onClick={() => setMenuOpen(false)}>Safety</Link>
            <Link to="/sos" onClick={() => setMenuOpen(false)} style={{ color: "var(--orange-500)", fontWeight: 700 }}>SOS</Link>

            <div className="uh-links-mobile-user">
              <button className="uh-btn uh-btn-outline" onClick={handleLogout}>Logout</button>
            </div>
          </nav>

          <div className="uh-nav-right">
            {/* Wallet moved out of the stat band and into the nav: it is the
                one figure people re-check constantly, and here it stays on
                screen at every scroll position instead of at one point on the
                page. Hidden (not zeroed) while loading or if the call failed,
                so it never shows a confident but wrong Rs 0.00. */}
            {!home.loading && home.walletPaisa !== null && (
              <Link className="uh-wallet-chip" to="/wallet" title="Wallet balance">
                <IconWallet />
                <span>
                  Rs {(home.walletPaisa / 100).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </Link>
            )}
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
              Welcome back, {currentUser.firstname}. Your{" "}
              <span className="uh-highlight">Digital Guardian</span> is on watch.
            </h1>
            {/* Names both halves of the product in the order the buttons
                below offer them: the workshop you book, and the report you
                file if the worst happens. */}
            <p className="uh-hero-sub">
              <strong>Book a service</strong> with a vetted workshop and approve every part
              before the work starts. If your vehicle goes missing,
              <strong> report it stolen</strong> and every camera on the network starts
              watching for your plate.
            </p>
            <div className="uh-hero-cta">
              {/* Leading wrench mirrors the siren on the button beside it, so
                  both hero actions are icon-first and read as a pair. */}
              <button className="uh-btn uh-btn-primary uh-btn-lg" onClick={() => navigate("/workshops")}>
                <IconWrench /> Book a Service
              </button>
              {/* The emergency path. Sits beside "Book a Service" because the
                  two are the hero's only actions: the planned one and the
                  urgent one. Routes to /sos, which owns theft reporting. */}
              <button className="uh-btn uh-btn-ghost uh-btn-lg uh-btn-alert" onClick={() => navigate("/sos")}>
                <IconSiren /> Report Stolen Vehicle
              </button>
            </div>
            {/* Deliberately static: the hero is the first paint, and account
                figures here meant it rendered a loading state before it said
                anything. The live numbers live in the stat band below. */}
            <div className="uh-trust">
              <span className="uh-stars"><IconStar /><IconStar /><IconStar /><IconStar /><IconStar /></span>
              <span>Vetted workshops · Nationwide camera network · 24/7 response</span>
            </div>
          </div>

          <div className="uh-hero-art">
            <div className="uh-blob uh-blob-blue" />
            <div className="uh-blob uh-blob-orange" />
            <div className="uh-hero-frame">
              <img src={heroImg} alt="Vehicle service dashboard preview" />

              {/* Static labels naming what the artwork depicts. These used to
                  mirror the account's own counts, which made the hero flicker
                  in on load; the real figures are in the stat band below. */}
              <div className="uh-chip uh-chip-top">
                <span className="uh-live-dot" />
                Camera network live
              </div>
              <div className="uh-chip uh-chip-bottom">
                <IconWrench />
                Workshop bookings
              </div>
            </div>
          </div>
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
            <Link className="uh-card" key={f.title} to={f.to}>
              <div className="uh-card-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works.
          This heading introduces the two sections below rather than owning a
          set of cards of its own. An earlier version put the two workflows in
          a pair of summary boxes here AND explained them again underneath,
          which said everything twice; the Servicing and AI Security panels are
          the explanation, so the heading simply leads into them. */}
      <section className="uh-flowhead" id="how-it-works">
        <div className="uh-section-head">
          <span className="uh-kicker">Process</span>
          <h2>How it works</h2>
          <p>
            Two workflows run this platform — the workshop that services your vehicle,
            and the camera network that watches it. Each one plays as a narrated
            walkthrough.
          </p>
        </div>
      </section>

      {/* Servicing Showcase.
          The counterpart to the AI Security block below. The page previously
          explained the surveillance side in depth while servicing was a single
          card in the features grid, which read as a security product that
          happens to book repairs.

          Its own slate band, deliberately: AI Security is near-black navy, so
          a lighter graphite here separates the two pillars while keeping them
          obviously the same family. The button opens ServicingDemo, the twin
          of the CCTV walkthrough. */}
      <section className="uh-svc" id="servicing">
        <div className="uh-svc-inner">
          <div className="uh-svc-panel">
            {/* A demonstration of the servicing workflow, NOT the reader's own
                booking. Nothing here comes from the API: the rail cycles all
                five stages so the sequence is legible, and the plate and
                workshop are fixed sample values. Their real booking is shown
                on the bookings page and in the closing band, where it can be
                stated accurately rather than implied by a looping animation. */}
            <div className="uh-jobcard">
              <div className="uh-jobcard-head">
                <span className="uh-jobcard-title"><IconCog /> Service Job Card</span>
                <span className="uh-jobcard-ref">Example</span>
              </div>

              <div className="uh-jobrail">
                {JOB_STAGES.map((stage, i) => {
                  const state = i < demoStage ? "done" : i === demoStage ? "active" : "todo";
                  return (
                    <div className={`uh-jobstage is-${state}`} key={stage.key}>
                      <span className="uh-jobstage-dot">{state === "done" ? <IconCheck /> : null}</span>
                      <span className="uh-jobstage-label">{stage.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="uh-jobcard-foot">
                <span>
                  <strong>{SAMPLE_JOB.plate}</strong> · {SAMPLE_JOB.workshop}
                </span>
                {/* Follows the rail, so the label and the highlighted stage
                    always agree. */}
                <span className="uh-jobcard-status">{JOB_STAGES[demoStage].label}</span>
              </div>
            </div>

            {/* Static, like the card above it: this panel illustrates what the
                platform does rather than reporting the reader's account. */}
            <div className="uh-svc-chips">
              {SAMPLE_SERVICES.map((t) => (
                <span className="uh-svc-chip" key={t}>{t}</span>
              ))}
            </div>
          </div>

          <div className="uh-svc-copy">
            {/* "Part 1 of 2" ties this panel to the How it works heading
                above; without it the two dark sections read as unrelated
                neighbours rather than the two halves it announced. */}
            <span className="uh-partnum">Workflow 1 of 2</span>
            <span className="uh-kicker uh-kicker-light">Servicing</span>
            <h2>Every repair, booked and tracked from here</h2>
            <p>
              VeriTrack is not only a watchdog. Book with a vetted workshop, approve the
              parts estimate before anyone lifts a spanner, and follow the job from pickup
              to handover without a single phone call.
            </p>
            {/* The real stages, numbered. This IS the how-it-works content for
                the servicing half — the list mirrors ServicingDemo's scenes, so
                the button below plays exactly what is written here. */}
            <ol className="uh-stagelist">
              {SERVICING_FLOW.map((step, i) => (
                <li key={step}>
                  <span className="uh-stagenum">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="uh-svc-cta">
              <button className="uh-btn uh-btn-primary" onClick={() => { primeSpeech(); setShowServicing(true); }}>
                Watch Servicing Workflow <IconArrowRight />
              </button>
              <button className="uh-btn uh-btn-ghost" onClick={() => navigate("/workshops")}>
                Book a Service
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* AI Security Showcase */}
      <section className="uh-ai" id="ai-security">
        <div className="uh-ai-inner">
          <div className="uh-ai-copy">
            <span className="uh-partnum">Workflow 2 of 2</span>
            <span className="uh-kicker uh-kicker-light">AI Security</span>
            <h2>AI eyes everywhere, watching what matters</h2>
            <p>
              A connected network of CCTV feeds and AI plate recognition works quietly in the
              background — spotting lost or stolen vehicles and flagging suspicious activity
              before it becomes a problem.
            </p>
            {/* Mirrors HowItWorksDemo's scenes, the same way the servicing
                list mirrors ServicingDemo's. */}
            <ol className="uh-stagelist is-ai">
              {AI_FLOW.map((step, i) => (
                <li key={step}>
                  <span className="uh-stagenum">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="uh-svc-cta">
              <button className="uh-btn uh-btn-primary" onClick={() => { primeSpeech(); setShowDemo(true); }}>
                Watch AI Eye Workflow <IconArrowRight />
              </button>
              <button className="uh-btn uh-btn-ghost" onClick={() => navigate("/safety")}>
                Open Safety
              </button>
            </div>
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
              {/* Was a hardcoded demo plate. Shows the user's own registered
                  plate so the illustration reflects their actual fleet, and
                  degrades to a neutral label when they have none. */}
              <div className="uh-feed-readout">
                <span>Plate: <strong>{home.vehicles[0]?.plateNumber ?? "—"}</strong></span>
                <span className={stolenCount ? "uh-match is-alert" : "uh-match"}>
                  {stolenCount ? "⚠ Flagged Stolen" : "✓ Registered"}
                </span>
              </div>
            </div>
            <div className="uh-heatmap-card">
              <IconMapPin />
              <div>
                <strong>Theft Heatmap</strong>
                <span>
                  {home.openSosCount > 0
                    ? `${home.openSosCount} open alert${home.openSosCount > 1 ? "s" : ""} on your account`
                    : "No open alerts on your account"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closing band, split in two: the servicing side on the left and the
          AI side on the right, so the page ends on the same two pillars it
          opened with. Both halves read from live data — neither is a generic
          marketing panel. */}
      <section className="uh-cta">
        <div className="uh-cta-inner">
          <div className="uh-cta-half">
            <span className="uh-cta-tag"><IconWrench /> Servicing</span>
            {home.vehicles.length === 0 ? (
              <>
                <h2>No vehicle registered yet</h2>
                <p>Add a plate number and you can book a workshop straight away.</p>
                <button className="uh-btn uh-btn-cta" onClick={() => navigate("/vehicles")}>
                  Register a Vehicle <IconArrowRight />
                </button>
              </>
            ) : nextBooking ? (
              <>
                <h2>Your vehicle is in the workshop</h2>
                <p>
                  {nextBooking.vehicle?.plateNumber ?? "Your vehicle"}
                  {nextBooking.workshop?.name ? ` · ${nextBooking.workshop.name}` : ""}
                  {" — "}
                  {BOOKING_STATUS_LABELS[nextBooking.status] ?? nextBooking.status}
                </p>
                <button className="uh-btn uh-btn-cta" onClick={() => navigate("/bookings")}>
                  View Booking <IconArrowRight />
                </button>
              </>
            ) : (
              <>
                <h2>Your vehicle is due a service</h2>
                <p>Book a service with a trusted workshop near you, tracked end to end.</p>
                <button className="uh-btn uh-btn-cta" onClick={() => navigate("/workshops")}>
                  Book a Service <IconArrowRight />
                </button>
              </>
            )}
          </div>

          <div className="uh-cta-rule" aria-hidden="true" />

          <div className="uh-cta-half">
            <span className="uh-cta-tag"><IconScan /> AI Eye</span>
            {stolenCount > 0 ? (
              <>
                <h2>A vehicle of yours is flagged stolen</h2>
                <p>
                  {stolenCount} vehicle{stolenCount > 1 ? "s" : ""} on the search list.
                  Every camera on the network is watching for {stolenCount > 1 ? "them" : "it"}.
                </p>
                <button className="uh-btn uh-btn-cta" onClick={() => navigate("/sos")}>
                  Open SOS <IconArrowRight />
                </button>
              </>
            ) : home.vehicles.length > 0 ? (
              <>
                <h2>Your plate is on watch</h2>
                <p>
                  {home.vehicles[0]?.plateNumber} is registered. If it is ever taken,
                  report it and every camera on the network starts looking for it.
                </p>
                {/* Lands directly on the theft form with the mode already
                    chosen (?report=stolen), rather than dropping people on the
                    SOS screen to find it. Single action on purpose: the
                    walkthrough already has its own button in the AI Security
                    section above. */}
                <button
                  className="uh-btn uh-btn-cta"
                  onClick={() => navigate("/sos?report=stolen")}
                >
                  Report Stolen <IconArrowRight />
                </button>
              </>
            ) : (
              <>
                <h2>AI eyes on every junction</h2>
                <p>
                  Register a vehicle and the camera network recognises its plate wherever
                  it passes.
                </p>
                <button className="uh-btn uh-btn-cta" onClick={() => { primeSpeech(); setShowDemo(true); }}>
                  See How AI Eye Works <IconArrowRight />
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Your account at a glance.
          Sits last, after the two calls to action, rather than under the hero:
          by this point the page has explained both workflows, so the numbers
          land as a closing summary of the reader's own account instead of as
          figures thrown at them before they know what any of it means.
          These were previously invented marketing figures ("10,000+ vehicles",
          "98% theft recovery") shown to a signed-in user. They are now this
          user's own numbers, each linking to the page that owns that data. */}
      <section className="uh-stats">
        <div className="uh-stats-inner">
          <Link className="uh-stat" to="/vehicles">
            <strong>{home.loading ? "—" : home.vehicles.length}</strong>
            <span>{home.vehicles.length === 1 ? "Vehicle Registered" : "Vehicles Registered"}</span>
          </Link>
          <Link className="uh-stat" to="/bookings">
            <strong>{home.loading ? "—" : home.inProgressBookings.length}</strong>
            <span>
              {awaitingReturn > 0 ? `In Progress · ${awaitingReturn} awaiting return` : "Bookings In Progress"}
            </span>
          </Link>
          <Link className="uh-stat" to="/bookings?status=finished">
            <strong>{home.loading ? "—" : home.bookings.length - home.activeBookings.length}</strong>
            <span>Services Completed</span>
          </Link>
          <Link className="uh-stat" to="/sos">
            <strong className={stolenCount || home.openSosCount ? "is-alert" : ""}>
              {home.loading ? "—" : stolenCount + home.openSosCount}
            </strong>
            <span>Open Alerts</span>
          </Link>
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
          {/* Every link goes somewhere real. "How It Works" asks which half of
              the product is meant — servicing or stolen-vehicle recovery — and
              opens that walkthrough, rather than jumping to the summary
              section or silently picking one of the two. */}
          <div className="uh-footer-col">
            <h4>Product</h4>
            <Link to="/workshops">Book a Service</Link>
            <Link to="/vehicles">My Vehicles</Link>
            <Link to="/safety">AI Security</Link>
            <button type="button" className="uh-footer-link" onClick={() => setShowChooser(true)}>
              How It Works
            </button>
            <Link to="/wallet">Digital Wallet</Link>
          </div>
          <div className="uh-footer-col">
            <h4>Company</h4>
            <Link to="/help#about">About Us</Link>
            <Link to="/help#contact">Contact</Link>
            <a href="#how-it-works">The Process</a>
          </div>
          <div className="uh-footer-col">
            <h4>Support</h4>
            <Link to="/help">Help Center</Link>
            <Link to="/sos">Emergency SOS</Link>
            <Link to="/help#contact">Report an Issue</Link>
          </div>
        </div>
        <div className="uh-footer-bottom">
          <span>© {new Date().getFullYear()} VeriTrack. All rights reserved.</span>
        </div>
      </footer>

      {/* The chooser closes as it hands off, so only one dialog is ever open. */}
      {showChooser ? (
        <HowItWorksChooser
          onClose={() => setShowChooser(false)}
          onChoose={(choice) => {
            setShowChooser(false);
            primeSpeech();
            if (choice === "servicing") setShowServicing(true);
            else setShowDemo(true);
          }}
        />
      ) : null}
      {/* Stable callbacks, not inline arrows. This page re-renders every 1.6s
          from the job-card animation, and an inline arrow would hand each
          modal a new onClose identity on every one of those ticks — which is
          what previously restarted their effects and cut the narration off
          mid-sentence. The modals no longer depend on onClose, but keeping
          these stable means a future effect that does cannot reintroduce it. */}
      {showDemo ? <HowItWorksDemo onClose={closeDemo} /> : null}
      {showServicing ? <ServicingDemo onClose={closeServicing} /> : null}
    </div>
  );
}

export default Home;
