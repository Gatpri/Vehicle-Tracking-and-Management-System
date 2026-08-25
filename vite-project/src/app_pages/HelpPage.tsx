import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import "./AppPages.css";

/**
 * Help, contact and about — the pages the landing-page footer links to.
 *
 * These were previously `href="#"` placeholders. Rather than invent a company
 * (a fake address, a careers board with no jobs, a support line nobody
 * answers), this page answers what a real user actually needs and routes every
 * request into a channel the product already has: chat for questions, SOS for
 * emergencies, the theft report for a stolen vehicle.
 *
 * One page with three anchored sections rather than three routes, because the
 * content is short and a visitor following "About Us" usually wants "Contact"
 * two seconds later.
 */

interface Faq {
  q: string;
  a: React.ReactNode;
}

const FAQS: Faq[] = [
  {
    q: "How does the camera actually find my vehicle?",
    a: (
      <>
        Cameras read the number plate of every vehicle that passes and compare the text against
        vehicles reported stolen. Only a plate you have reported through <Link to="/sos">SOS</Link>{" "}
        is ever flagged — nothing happens to anyone else's vehicle.
      </>
    ),
  },
  {
    q: "My vehicle was stolen. What do I do first?",
    a: (
      <>
        Open <Link to="/sos">SOS</Link>, choose <strong>“My vehicle was stolen”</strong> and select
        the vehicle. That marks it as stolen, alerts our tracking team, and is what puts it on the
        camera watch list. Report it to the police as well — we can tell you where it was seen, but
        only they can recover it.
      </>
    ),
  },
  {
    q: "Why do I need to add photos of my vehicle?",
    a: (
      <>
        The photos are evidence for a person, not the recogniser. When a camera reports a sighting,
        you and our team compare that frame against your photos to confirm it really is your
        vehicle before anyone acts on it.
      </>
    ),
  },
  {
    q: "A workshop quoted me more than the estimate. Is that normal?",
    a: (
      <>
        Quotes are checked against what other workshops charge for the same job, and one that is
        unusually high is flagged on your booking. If a final price still looks wrong, raise it in{" "}
        <Link to="/chat">Chat</Link> before paying.
      </>
    ),
  },
  {
    q: "How do I get money out of my wallet?",
    a: (
      <>
        Open <Link to="/wallet">Wallet</Link> and request a withdrawal. Requests are reviewed by the
        accounts team before the transfer is released, so allow a little time.
      </>
    ),
  },
  {
    q: "Who can see my location?",
    a: (
      <>
        Your position is sent only when you file an SOS, and while a delivery of your vehicle is in
        progress — so you can watch it move. It is not tracked at any other time.
      </>
    ),
  },
];

export default function HelpPage() {
  const [params] = useSearchParams();
  const { hash } = useLocation();
  // "Report an Issue" and "About Us" link straight to a section. React Router
  // does not scroll to a hash on its own — without this the visitor lands at
  // the top of the page and the link looks broken.
  const topic = params.get("topic");
  const [open, setOpen] = useState<number | null>(topic === "faq" ? 0 : null);

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    // The section exists on first paint, but scrolling in the same frame as
    // the mount lands short — one frame's delay lets layout settle first.
    const id = window.requestAnimationFrame(() => {
      document
        .querySelector(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [hash]);

  return (
    <div className="uh-page ap-help">
      <div className="uh-page-head">
        <h1>Help &amp; Contact</h1>
        <p>Answers to the common questions, and how to reach a person when you need one.</p>
      </div>

      {/* Emergency first: someone whose vehicle has just gone missing should
          not have to scroll past a FAQ to find the button that matters. */}
      <section className="uh-card ap-help-urgent" id="emergency">
        <div>
          <h2>Emergency</h2>
          <p>
            If your vehicle has just been stolen, or you are in danger, use SOS. It alerts our
            tracking team straight away and flags your vehicle for every camera on the network.
          </p>
        </div>
        <Link className="uh-btn uh-btn-danger" to="/sos">
          Open SOS
        </Link>
      </section>

      <section id="faq">
        <h2 className="ap-help-h2">Common questions</h2>
        <div className="ap-faq">
          {FAQS.map((f, i) => (
            <div className={`ap-faq-item ${open === i ? "is-open" : ""}`} key={f.q}>
              <button
                className="ap-faq-q"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{f.q}</span>
                <span className="ap-faq-mark" aria-hidden="true">
                  {open === i ? "−" : "+"}
                </span>
              </button>
              {open === i ? <div className="ap-faq-a">{f.a}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section id="contact">
        <h2 className="ap-help-h2">Still need help?</h2>
        <div className="ap-help-grid">
          <div className="uh-card">
            <h3>Ask a question</h3>
            <p>
              Chat reaches whoever handles your question — support, the workshop working on your
              vehicle, or the tracking team.
            </p>
            <Link className="uh-btn uh-btn-primary" to="/chat">
              Open chat
            </Link>
          </div>

          <div className="uh-card">
            <h3>Report a problem</h3>
            <p>
              Something wrong with a booking, a charge, or the app itself? Send it through chat and
              describe what you expected to happen — it reaches the same team.
            </p>
            <Link className="uh-btn uh-btn-outline" to="/chat">
              Report an issue
            </Link>
          </div>

          <div className="uh-card">
            <h3>Check on your vehicle</h3>
            <p>
              Sightings, theft reports and the incident heatmap for your area are all on the Safety
              page.
            </p>
            <Link className="uh-btn uh-btn-outline" to="/safety">
              Open Safety
            </Link>
          </div>
        </div>
      </section>

      <section id="about">
        <h2 className="ap-help-h2">About VeriTrack</h2>
        <div className="uh-card ap-help-about">
          <p>
            VeriTrack connects vehicle owners, workshops and a network of cameras in one place. You
            register a vehicle, book its servicing, and — if it is ever stolen — the same cameras
            that watch ordinary traffic help find it.
          </p>
          <p>
            The plate recognition runs on models trained on Nepali number plates specifically,
            rather than a general-purpose reader, because the plates here are frequently
            hand-painted and in Devanagari. That work is what makes the rest of the product
            possible.
          </p>
          <p className="ap-help-note">
            VeriTrack is a final-year engineering project, not a commercial service. It is built as
            a working system rather than a prototype, but it is not operating a real camera network.
          </p>
        </div>
      </section>
    </div>
  );
}
