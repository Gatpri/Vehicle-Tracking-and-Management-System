import { useEffect, useRef, useState } from "react";
import "../Styles/howItWorks.css";

/**
 * The picker shown by the footer's "How It Works", which covers two unrelated
 * halves of the product: getting a vehicle serviced, and recovering a stolen
 * one. The link used to open the theft/CCTV walkthrough directly, which quietly
 * answered only half the question the label asks.
 *
 * Rather than a third walkthrough spanning both, this asks which one the
 * visitor came for and hands off to the existing demo — HowItWorksDemo for
 * recovery, ServicingDemo for servicing. Both already exist and are already
 * reachable from their own sections; this only routes to them.
 *
 * Bilingual like the demos it opens, and for the same reason: a visitor who
 * reads only Nepali must be able to choose before they can be narrated to. The
 * language picked here is not passed on — each demo carries its own toggle and
 * defaults the same way, so nothing is lost by letting them re-choose.
 */

type Lang = "en" | "ne";

interface Phrase {
  en: string;
  ne: string;
}

const t = (p: Phrase, lang: Lang): string => (lang === "ne" ? p.ne : p.en);

const UI = {
  kicker: { en: "How it works", ne: "यो कसरी काम गर्छ" },
  title: {
    en: "What would you like to see?",
    ne: "तपाईं के हेर्न चाहनुहुन्छ?",
  },
  lead: {
    en: "Two walkthroughs, one for each side of the system. Pick either — you can come back for the other.",
    ne: "प्रणालीका दुई पक्षका लागि दुई वटा प्रस्तुति। कुनै एक छान्नुहोस् — अर्को पछि पनि हेर्न सकिन्छ।",
  },
  servicingTitle: { en: "Getting a vehicle serviced", ne: "गाडी सर्भिस गराउने" },
  servicingBody: {
    en: "Book a workshop, approve the parts you actually want, pay, and get the vehicle back.",
    ne: "वर्कशप बुक गर्ने, चाहिने पार्ट्स स्वीकृत गर्ने, भुक्तानी गर्ने, र गाडी फिर्ता लिने।",
  },
  recoveryTitle: { en: "Recovering a stolen vehicle", ne: "चोरी भएको गाडी फेला पार्ने" },
  recoveryBody: {
    en: "Report the theft, and the CCTV network reads number plates to find where it went.",
    ne: "चोरीको उजुरी दिनुहोस्, र CCTV नेटवर्कले नम्बर प्लेट पढेर गाडी कहाँ गयो पत्ता लगाउँछ।",
  },
  langLabel: { en: "Language", ne: "भाषा" },
  close: { en: "Close", ne: "बन्द गर्नुहोस्" },
} satisfies Record<string, Phrase>;

export type DemoChoice = "servicing" | "recovery";

export default function HowItWorksChooser({
  onChoose,
  onClose,
}: {
  onChoose: (choice: DemoChoice) => void;
  onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const closeRef = useRef<HTMLButtonElement>(null);
  const L = (p: Phrase) => t(p, lang);

  // Matches the demos' dialog behaviour exactly: Escape exits, focus starts on
  // the close button, and the page behind cannot scroll while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="hiw-backdrop" onClick={onClose} role="presentation">
      <div
        className="hiw-modal hiw-modal-chooser"
        lang={lang}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hiw-chooser-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hiw-head">
          <div>
            <span className="hiw-kicker">{L(UI.kicker)}</span>
            <h2 id="hiw-chooser-title">{L(UI.title)}</h2>
          </div>

          <div className="hiw-head-right">
            <div className="hiw-lang" role="group" aria-label={L(UI.langLabel)}>
              <button
                className={`hiw-lang-btn ${lang === "en" ? "is-on" : ""}`}
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
              >
                English
              </button>
              <button
                className={`hiw-lang-btn ${lang === "ne" ? "is-on" : ""}`}
                onClick={() => setLang("ne")}
                aria-pressed={lang === "ne"}
                lang="ne"
              >
                नेपाली
              </button>
            </div>
            <button ref={closeRef} className="hiw-close" onClick={onClose} aria-label={L(UI.close)}>
              ×
            </button>
          </div>
        </header>

        <div className="hiw-chooser-body">
          <p className="hiw-chooser-lead">{L(UI.lead)}</p>

          <div className="hiw-choices">
            {/* Buttons rather than cards-with-a-link: the whole tile is the
                target, so it works the same by keyboard as by mouse. */}
            <button
              type="button"
              className="hiw-choice is-servicing"
              onClick={() => onChoose("servicing")}
            >
              <span className="hiw-choice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5 1.4 1.4 2.5-2.5a4 4 0 0 1-4.4-4.4Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="hiw-choice-text">
                <strong>{L(UI.servicingTitle)}</strong>
                <span>{L(UI.servicingBody)}</span>
              </span>
              <span className="hiw-choice-arrow" aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              className="hiw-choice is-recovery"
              onClick={() => onChoose("recovery")}
            >
              <span className="hiw-choice-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3.2" />
                </svg>
              </span>
              <span className="hiw-choice-text">
                <strong>{L(UI.recoveryTitle)}</strong>
                <span>{L(UI.recoveryBody)}</span>
              </span>
              <span className="hiw-choice-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
