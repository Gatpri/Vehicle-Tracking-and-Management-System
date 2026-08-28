import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelSpeech,
  hasNepaliVoice,
  loadVoices,
  speak,
  speechSupported,
} from "../../lib/speak";
import "../Styles/howItWorks.css";

/**
 * A narrated, step-by-step walkthrough of the *servicing* side of the system,
 * opened by "See How Servicing Works" in the Servicing section.
 *
 * It is the twin of HowItWorksDemo (which explains the theft/CCTV side) and
 * deliberately reuses that component's stylesheet and dialog shape, so the two
 * read as one product rather than two designs.
 *
 * Where it differs: some scenes play a short clip of a real workshop instead
 * of a drawn animation. Those clips are cut from one continuous piece of
 * footage, and the cutting matters — the source shows a mechanic stripping,
 * replacing and refitting parts in one unbroken run, which is NOT how this
 * system works. Here a workshop may only inspect and quote; the spanners come
 * out after the customer has approved the parts and paid. So the footage is
 * split at those seams and each fragment is placed against the stage it
 * actually belongs to, with the estimate and payment steps in between. Playing
 * the clip whole would teach visitors a sequence the software forbids.
 *
 * The scene list mirrors the real state machine in
 * backend_api/constants/bookingWorkflow.js, delivery path:
 *   pending -> accepted -> delivery-requested/assigned -> out-for-delivery
 *   -> picked-up -> dropped -> servicing-started -> estimation-pending
 *   -> estimation-confirmed -> payment-pending -> payment-completed
 *   -> completed -> return-assigned -> return-picked-from-workshop
 *   -> delivered -> finished
 */

type Lang = "en" | "ne";

interface Phrase {
  en: string;
  ne: string;
  /** Nepali in Latin letters, spoken (never shown) when no Devanagari voice
   *  exists on the device. Only narrated lines need it. */
  neRoman?: string;
}

const UI = {
  kicker: { en: "How it works", ne: "यो कसरी काम गर्छ" },
  title: {
    en: "Getting your vehicle serviced, step by step",
    ne: "गाडी सर्भिस गराउने प्रक्रिया, चरणबद्ध रूपमा",
  },
  stepOf: { en: "Step {n} of {total}", ne: "चरण {n} / {total}" },
  back: { en: "Back", ne: "पछाडि" },
  next: { en: "Next", ne: "अगाडि" },
  play: { en: "Play", ne: "चलाउनुहोस्" },
  pause: { en: "Pause", ne: "रोक्नुहोस्" },
  again: { en: "Watch again", ne: "फेरि हेर्नुहोस्" },
  listen: { en: "Listen", ne: "सुन्नुहोस्" },
  narrating: { en: "Narrating", ne: "बोल्दैछ" },
  gotIt: { en: "Got it", ne: "बुझेँ" },
  close: { en: "Close", ne: "बन्द गर्नुहोस्" },
  langLabel: { en: "Language", ne: "भाषा" },
  accentNote: {
    en: "This device has no Nepali voice, so the narration is read with an English accent.",
    ne: "यो यन्त्रमा नेपाली स्वर नभएकाले अङ्ग्रेजी उच्चारणमा पढिन्छ।",
  },
} satisfies Record<string, Phrase>;

interface Scene {
  tag: Phrase;
  title: Phrase;
  body: Phrase;
  /** Hold time when narration is off, in ms. */
  ms: number;
}

const SCENES: Scene[] = [
  {
    tag: { en: "Book", ne: "बुकिङ" },
    title: {
      en: "You choose a workshop and book",
      ne: "तपाईं वर्कशप छानेर बुक गर्नुहोस्",
    },
    body: {
      en: "Open the Workshops page and you will see the garages near you, with their rating and the services each one offers. Choose one, pick the service your vehicle needs, and send the booking. The workshop receives it straight away.",
      ne: "वर्कशप पृष्ठ खोल्नुहोस्, त्यहाँ तपाईंको नजिकका ग्यारेजहरू, तिनको रेटिङ र प्रत्येकले दिने सेवाहरू देखिन्छन्। एउटा छान्नुहोस्, गाडीलाई चाहिने सेवा रोज्नुहोस् र बुकिङ पठाउनुहोस्। वर्कशपले तुरुन्तै त्यो प्राप्त गर्छ।",
      neRoman:
        "Workshop prishtha kholnuhos, tyahaan tapaiko najikka garage haru, tinko rating ra pratyekle dine sewa haru dekhinchhan. Euta chhannuhos, gaadi lai chahine sewa rojnuhos ra booking pathaunuhos. Workshop le turuntai tyo prapta garchha.",
    },
    ms: 9000,
  },
  {
    tag: { en: "Pickup", ne: "लिन आउने" },
    title: {
      en: "A rider collects the vehicle",
      ne: "राइडर गाडी लिन आउँछ",
    },
    body: {
      en: "If you ask for pickup, a delivery rider is assigned and comes to your location. While the rider is on the way you can watch them move on the map, so you know exactly when they will arrive.",
      ne: "तपाईंले पिकअप मागेमा एक जना डेलिभरी राइडर तोकिन्छ र तपाईंको ठाउँमा आउँछ। राइडर बाटोमा हुँदा नक्सामा उहाँको चाल हेर्न सकिन्छ, त्यसैले कहिले आइपुग्छ भन्ने थाहा हुन्छ।",
      neRoman:
        "Tapaile pickup mageama ek jana delivery rider tokinchha ra tapaiko thaau ma aauchha. Rider baato ma hunda naksa ma unko chaal herna sakinchha, tyasaile kahile aaipugchha bhanne thaha hunchha.",
    },
    ms: 9000,
  },
  {
    tag: { en: "Arrives", ne: "पुग्छ" },
    title: {
      en: "The vehicle reaches the workshop",
      ne: "गाडी वर्कशपमा पुग्छ",
    },
    body: {
      en: "The rider hands the vehicle over at the garage and the booking moves to dropped. From this moment the workshop is responsible for it, and you can see that change on your bookings page.",
      ne: "राइडरले ग्यारेजमा गाडी बुझाउँछ र बुकिङ “ड्रप्ड” अवस्थामा पुग्छ। यही क्षणदेखि गाडीको जिम्मेवारी वर्कशपको हुन्छ, र यो परिवर्तन तपाईंको बुकिङ पृष्ठमा देखिन्छ।",
      neRoman:
        "Rider le garage ma gaadi bujhauchha ra booking dropped awastha ma pugchha. Yahi kshan dekhi gaadi ko jimmewari workshop ko hunchha, ra yo parivartan tapaiko booking prishtha ma dekhinchha.",
    },
    ms: 8500,
  },
  {
    tag: { en: "Inspect", ne: "जाँच" },
    title: {
      en: "The mechanic inspects and finds what is worn",
      ne: "मेकानिकले जाँचेर बिग्रेको भाग पत्ता लगाउँछ",
    },
    body: {
      en: "The mechanic opens the vehicle and checks it part by part. Nothing is replaced at this stage. The job here is only to find what has worn out and to write it down.",
      ne: "मेकानिकले गाडी खोलेर एक-एक भाग जाँच्छन्। यस चरणमा केही पनि फेरिँदैन। यहाँको काम भनेको के-के बिग्रेको छ पत्ता लगाएर टिपोट गर्ने मात्र हो।",
      neRoman:
        "Mechanic le gaadi kholera ek-ek bhaag janchhan. Yas charan ma kehi pani pherindaina. Yahaan ko kaam bhaneko ke-ke bigreko chha patta lagayera tipot garne matra ho.",
    },
    ms: 8500,
  },
  {
    tag: { en: "Estimate", ne: "अनुमान" },
    title: {
      en: "You get the parts list before any work starts",
      ne: "काम सुरु हुनुअघि पार्ट्सको सूची आउँछ",
    },
    body: {
      en: "The workshop sends you a list of the parts it wants to change, each with its own price. You can untick any part you do not want, or ask a question about it, and the total changes as you do. Nothing is decided until you agree.",
      ne: "वर्कशपले फेर्न चाहेका पार्ट्सको सूची, प्रत्येकको मूल्यसहित तपाईंलाई पठाउँछ। नचाहेको पार्ट हटाउन सक्नुहुन्छ वा त्यसबारे प्रश्न सोध्न सक्नुहुन्छ, र त्यसअनुसार जम्मा रकम बदलिन्छ। तपाईंले सहमति नजनाएसम्म केही पनि निर्णय हुँदैन।",
      neRoman:
        "Workshop le pherna chaheka parts ko suchi, pratyek ko mulya sahit tapailai pathauchha. Nachaheko part hataauna saknuhunchha wa tyasbare prashna sodhna saknuhunchha, ra tyas anusar jamma rakam badlinchha. Tapaile sahamati najanaye samma kehi pani nirnaya hundaina.",
    },
    ms: 11000,
  },
  {
    tag: { en: "Pay", ne: "भुक्तानी" },
    title: {
      en: "You approve, then pay from the wallet",
      ne: "स्वीकृत गरेपछि वालेटबाट भुक्तानी",
    },
    body: {
      en: "Once you accept the list, the amount is asked for from your digital wallet. Only after this payment is complete is the workshop allowed to begin the repair.",
      ne: "तपाईंले सूची स्वीकार गरेपछि सो रकम तपाईंको डिजिटल वालेटबाट मागिन्छ। यो भुक्तानी सकिएपछि मात्र वर्कशपलाई मर्मत सुरु गर्ने अनुमति मिल्छ।",
      neRoman:
        "Tapaile suchi swikar gare pachhi so rakam tapaiko digital wallet baata maaginchha. Yo bhuktani sakiye pachhi matra workshop lai marmat suru garne anumati milchha.",
    },
    ms: 9500,
  },
  {
    tag: { en: "Repair", ne: "मर्मत" },
    title: {
      en: "Now the parts are changed",
      ne: "अब पार्ट्स फेरिन्छ",
    },
    body: {
      en: "With your approval in hand, the mechanic fits the new parts and finishes the servicing. Every part that was changed stays recorded against your vehicle, so you can look it up later.",
      ne: "तपाईंको स्वीकृति पाएपछि मेकानिकले नयाँ पार्ट्स जडान गरी सर्भिसिङ पूरा गर्छन्। फेरिएको हरेक पार्ट तपाईंको गाडीको रेकर्डमा रहन्छ, त्यसैले पछि हेर्न सकिन्छ।",
      neRoman:
        "Tapaiko swikriti paaye pachhi mechanic le nayaan parts jadaan gari servicing pura garchhan. Pheriyeko harek part tapaiko gaadi ko record ma rahanchha, tyasaile pachhi herna sakinchha.",
    },
    ms: 9000,
  },
  {
    tag: { en: "Returned", ne: "फिर्ता" },
    title: {
      en: "The vehicle comes back to you",
      ne: "गाडी तपाईंकहाँ फिर्ता आउँछ",
    },
    body: {
      en: "When the work is signed off, a rider brings the vehicle back to the place you chose, and you can follow that journey on the map as well. Once it is handed over, the booking is finished and the whole job stays in your service history.",
      ne: "काम सकिएको प्रमाणित भएपछि राइडरले तपाईंले छानेको ठाउँमा गाडी फिर्ता ल्याउँछ, र त्यो यात्रा पनि नक्सामा हेर्न सकिन्छ। बुझाइसकेपछि बुकिङ सम्पन्न हुन्छ र सम्पूर्ण काम तपाईंको सेवा इतिहासमा रहन्छ।",
      neRoman:
        "Kaam sakiyeko pramanit bhaye pachhi rider le tapaile chhaneko thaau ma gaadi firta lyauchha, ra tyo yatra pani naksa ma herna sakinchha. Bujhai sake pachhi booking sampanna hunchha ra sampurna kaam tapaiko sewa itihaas ma rahanchha.",
    },
    ms: 11000,
  },
];

/** One connector per scene, spoken ahead of the body so the steps join up. */
const STEP_LEAD: Phrase[] = [
  { en: "First of all,", ne: "सबैभन्दा सुरुमा,", neRoman: "Sabai bhanda suruma," },
  { en: "After that,", ne: "त्यसपछि,", neRoman: "Tyaspachhi," },
  { en: "A little later,", ne: "केही बेरपछि,", neRoman: "Kehi ber pachhi," },
  { en: "At the workshop,", ne: "वर्कशपमा,", neRoman: "Workshop ma," },
  { en: "Before any work begins,", ne: "काम सुरु हुनुअघि,", neRoman: "Kaam suru hunu aghi," },
  { en: "Once you agree,", ne: "सहमति भएपछि,", neRoman: "Sahamati bhaye pachhi," },
  { en: "Only then,", ne: "त्यसपछि मात्र,", neRoman: "Tyaspachhi matra," },
  { en: "Finally,", ne: "अन्त्यमा,", neRoman: "Antya ma," },
];

const FADE_MS = 420;
const SPEECH_TAIL_MS = 550;

/** The plate the story follows, matching the one used in the CCTV walkthrough. */
const DEMO_PLATE = "BA 12 PA 3456";

/**
 * Lowercases the first letter so a connector can be glued in front of a
 * sentence. Acronyms are left alone — "SOS" must not become "sOS".
 */
const openLower = (sentence: string, lang: Lang): string => {
  if (lang === "ne" && !/^[A-Za-z]/.test(sentence)) return sentence;
  const [first = "", second = ""] = [sentence[0], sentence[1]];
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) return sentence;
  return first.toLowerCase() + sentence.slice(1);
};

function usePrefersReducedMotion(): boolean {
  // Seeded from a lazy initializer rather than set inside the effect: the
  // first render then already has the right answer, so a clip never starts
  // playing for one frame before being told not to.
  const [reduce, setReduce] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduce;
}

const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="4 9 8 9 13 5 13 19 8 15 4 15" />
    {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9.5l4 5M21 9.5l-4 5" />}
  </svg>
);

/**
 * A workshop clip. Muted and inline because it plays automatically; `key` on
 * the src makes React swap the element rather than reuse it, so a new scene
 * always starts its clip from the beginning.
 */
/**
 * How much slower than real time the clips run.
 *
 * The fragments are 1.6–2.6s but the steps they sit under last 8.5–11s when
 * narrated, so at 1x each one looped four to six times and the whole panel read
 * as sped-up footage. At 0.5x a fragment covers 3.2–5.2s, which halves the
 * number of wraps and lets the eye actually follow what the mechanic is doing.
 *
 * Not lower than 0.5: browsers stop decoding smoothly below roughly a quarter
 * speed, and the motion starts to judder rather than look deliberate.
 */
const CLIP_RATE = 0.5;

function Clip({ src, label, play }: { src: string; label: string; play: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set on every run, not once on mount: the browser resets playbackRate
    // when a new source loads, and some engines reset it on pause/play too.
    el.playbackRate = CLIP_RATE;

    if (play) {
      // Autoplay can still be refused; there is nothing useful to do about it
      // and an unhandled rejection would surface as a console error.
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [play]);

  return (
    <video
      ref={ref}
      className="svcd-clip"
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      aria-label={label}
    />
  );
}

/** Drawn scenes for the steps that have no footage, plus the clip scenes. */
function SceneArt({ index, lang, play }: { index: number; lang: Lang; play: boolean }) {
  const t = (en: string, ne: string) => (lang === "ne" ? ne : en);

  // 1 — choosing a workshop from the list
  if (index === 0) {
    return (
      <div className="svcd-art svcd-list">
        {[
          { n: t("Bikers Moto", "बाइकर्स मोटो"), r: "4.9" },
          { n: t("City Garage", "सिटी ग्यारेज"), r: "4.6" },
          { n: t("Highway Motors", "हाइवे मोटर्स"), r: "4.4" },
        ].map((w, i) => (
          <div className={`svcd-shop ${i === 0 ? "is-picked" : ""}`} key={w.n}>
            <span className="svcd-shop-name">{w.n}</span>
            <span className="svcd-shop-rate">★ {w.r}</span>
          </div>
        ))}
        <div className="svcd-book-btn">{t("Book service", "सर्भिस बुक")}</div>
      </div>
    );
  }

  // 2 — rider travelling to the customer
  if (index === 1) {
    return (
      <div className="svcd-art svcd-map">
        <div className="svcd-route" />
        <div className="svcd-pin svcd-pin-home">{t("You", "तपाईं")}</div>
        <div className="svcd-pin svcd-pin-shop">{t("Workshop", "वर्कशप")}</div>
        <div className="svcd-rider" aria-hidden="true" />
      </div>
    );
  }

  // 3, 4, 7, 8 — real workshop footage, cut to the matching stage
  if (index === 2) {
    return (
      <div className="svcd-art svcd-video">
        <Clip src="/video/svc-arrive.mp4" label="The vehicle arriving at the workshop" play={play} />
        <span className="svcd-vlabel">{t("Dropped at workshop", "वर्कशपमा बुझाइयो")}</span>
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="svcd-art svcd-video">
        <Clip src="/video/svc-diagnose.mp4" label="A mechanic inspecting a worn part" play={play} />
        <span className="svcd-vlabel">{t("Inspecting — nothing replaced yet", "जाँच — अझै केही फेरिएको छैन")}</span>
      </div>
    );
  }

  // 5 — the parts quote, with a line struck out by the customer
  if (index === 4) {
    return (
      <div className="svcd-art svcd-quote">
        <div className="svcd-quote-head">{t("Parts estimate", "पार्ट्स अनुमान")}</div>
        {[
          { p: t("Brake pads", "ब्रेक प्याड"), on: true },
          { p: t("Air filter", "एयर फिल्टर"), on: true },
          { p: t("Engine oil", "इन्जिन तेल"), on: true },
          { p: t("Chain set", "चेन सेट"), on: false },
        ].map((r, i) => (
          <div className={`svcd-qrow ${r.on ? "" : "is-off"}`} key={r.p} style={{ animationDelay: `${0.5 + i * 0.45}s` }}>
            <span className="svcd-qbox" />
            <span className="svcd-qname">{r.p}</span>
            <span className="svcd-qbar" />
          </div>
        ))}
        <div className="svcd-qtotal">{t("You choose what stays", "के राख्ने तपाईं छान्नुहोस्")}</div>
      </div>
    );
  }

  // 6 — wallet payment releasing the job
  if (index === 5) {
    return (
      <div className="svcd-art svcd-pay">
        <div className="svcd-wallet">
          <span className="svcd-wallet-label">{t("Wallet", "वालेट")}</span>
          <span className="svcd-wallet-bar" />
        </div>
        <div className="svcd-lock">
          <span className="svcd-lock-icon" aria-hidden="true" />
          <span>{t("Repair unlocked", "मर्मत खुल्यो")}</span>
        </div>
      </div>
    );
  }

  if (index === 6) {
    return (
      <div className="svcd-art svcd-video">
        <Clip src="/video/svc-repair.mp4" label="New parts being fitted after approval" play={play} />
        <span className="svcd-vlabel">{t("Approved — parts being fitted", "स्वीकृत — पार्ट्स जडान हुँदै")}</span>
      </div>
    );
  }

  return (
    <div className="svcd-art svcd-video">
      <Clip src="/video/svc-handover.mp4" label="The finished vehicle handed back" play={play} />
      <span className="svcd-vlabel">
        {t("Returned to you", "तपाईंलाई फिर्ता")} · {DEMO_PLATE}
      </span>
    </div>
  );
}

export default function ServicingDemo({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Narration starts ON where the browser can speak.
  //
  // It used to default off, which made the walkthrough open silent AND made
  // every step flick past on a fixed 6-12s timer while the viewer was still
  // reading. Those are the same bug: with narration on, the speech itself is
  // the clock (see the driver effect below), so each scene lasts exactly as
  // long as its sentence takes to say. Off, it falls back to a guessed
  // duration that is necessarily wrong for everyone.
  //
  // Autoplay policy can still refuse the first utterance until the visitor
  // interacts; the toggle then turns it on properly, and the fixed timer
  // carries the scenes in the meantime. Nothing breaks either way.
  const [narrate, setNarrate] = useState(() => speechSupported());
  const [lang, setLang] = useState<Lang>("en");
  const [fading, setFading] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  /**
   * False until loadVoices() settles.
   *
   * Without this the narration effect fired once on mount with an empty voice
   * list, and again ~50ms later when the voices arrived — and because `voices`
   * is one of its dependencies, the re-run's cleanup called cancelSpeech() on
   * the sentence already being spoken. Chrome frequently never recovers from
   * that speak/cancel/speak inside one tick and stays silent for the rest of
   * the walkthrough, which is exactly the "no sound" symptom. Holding the
   * first utterance until the list is known costs at most ~1.2s (loadVoices
   * resolves early when voices are already present) and removes the race.
   */
  const [voicesReady, setVoicesReady] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const narrationIdRef = useRef(0);

  const total = SCENES.length;
  const scene = SCENES[index];
  const canSpeak = speechSupported();
  const nepaliAvailable = hasNepaliVoice(voices);
  const L = (p: Phrase) => (lang === "ne" ? p.ne : p.en);

  useEffect(() => {
    loadVoices().then((v) => {
      setVoices(v);
      // Set even when the list is empty: a device with no voices at all must
      // still narrate through the default voice rather than wait forever.
      setVoicesReady(true);
    });
  }, []);

  // Escape closes; focus starts on the close button; the page behind must not
  // scroll while a full-screen dialog is open.
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
    // Deliberately empty: this effect installs the Escape handler and the
    // scroll lock, which are set up once for the life of the dialog.
    //
    // It used to depend on [onClose] and to call cancelSpeech() in its
    // cleanup. The parent passes onClose as an inline arrow, so it is a new
    // identity on every render of the homepage — and the homepage re-renders
    // every 1.6s from the job-card animation. The effect therefore tore down
    // and re-ran on that same beat, cancelling the narration mid-sentence
    // every time. That is why the web was silent while mobile, which has no
    // ticking parent, spoke normally.
    //
    // onClose is only read inside the keydown handler, and calling last
    // render's copy is harmless: every version closes the same dialog.
    // Cancelling speech on unmount is handled by the narration effect's own
    // cleanup, which already runs when the dialog goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The driver: either the voice finishing, or a timer, decides when to move on.
  useEffect(() => {
    if (!playing) return;

    const runId = ++narrationIdRef.current;
    let timer: number | undefined;
    let cancelled = false;

    const advance = () => {
      if (cancelled || narrationIdRef.current !== runId) return;
      if (index >= total - 1) {
        setPlaying(false);
        return;
      }
      setFading(true);
      timer = window.setTimeout(() => {
        if (cancelled || narrationIdRef.current !== runId) return;
        setIndex((i) => i + 1);
        setFading(false);
      }, FADE_MS);
    };

    // Waiting on voicesReady, not just canSpeak: speaking before the list
    // settles is what caused the cancel-mid-sentence race described above.
    if (narrate && canSpeak && voicesReady) {
      const lead = STEP_LEAD[index] ?? STEP_LEAD[STEP_LEAD.length - 1];
      const spoken = `${lead[lang]} ${openLower(scene.body[lang], lang)}`;
      const spokenRoman = scene.body.neRoman
        ? `${lead.neRoman} ${openLower(scene.body.neRoman, "ne")}`
        : undefined;
      speak(spoken, lang, voices, { romanized: spokenRoman, tailMs: SPEECH_TAIL_MS }).then(advance);
    } else if (narrate && canSpeak && !voicesReady) {
      // Narration is wanted but the voice list has not settled yet. Hold the
      // scene rather than starting the silent reading timer: falling through
      // to it would advance — or finish the whole walkthrough — before the
      // first word was ever spoken. The effect re-runs the moment voicesReady
      // flips, and speaking begins then.
    } else {
      timer = window.setTimeout(advance, scene.ms);
    }

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      // Stop the voice too. Pausing re-runs this effect, so without this the
      // utterance already handed to the browser keeps talking to the end of
      // its sentence over a visibly paused scene — and closing mid-sentence
      // left a voice narrating a dialog that is no longer on screen. Every
      // other exit from a scene (goTo, replay, changeLang) already cancels;
      // this is the one path that did not.
      cancelSpeech();
    };
    // scene.body is stable per index; listing index covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, narrate, canSpeak, voicesReady, lang, voices, total]);

  const toggleNarration = useCallback(() => {
    setNarrate((on) => {
      cancelSpeech();
      narrationIdRef.current++;
      return !on;
    });
  }, []);

  const changeLang = (next: Lang) => {
    if (next === lang) return;
    cancelSpeech();
    narrationIdRef.current++;
    setLang(next);
  };

  const goTo = (i: number) => {
    cancelSpeech();
    narrationIdRef.current++;
    setFading(false);
    setIndex(i);
    setPlaying(false);
  };

  const replay = () => {
    cancelSpeech();
    narrationIdRef.current++;
    setFading(false);
    setIndex(0);
    setPlaying(true);
  };

  // Restarts the scene's animations (and its clip) on every change. Not keyed
  // on `playing`: pausing must freeze the scene, not remount it.
  const stageKey = useMemo(() => `${index}-${lang}`, [index, lang]);

  const stepLabel = L(UI.stepOf)
    .replace("{n}", String(index + 1))
    .replace("{total}", String(total));

  return (
    <div className="hiw-backdrop" onClick={onClose} role="presentation">
      <div
        className="hiw-modal"
        lang={lang}
        role="dialog"
        aria-modal="true"
        aria-labelledby="svcd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hiw-head">
          <div>
            <span className="hiw-kicker">{L(UI.kicker)}</span>
            <h2 id="svcd-title">{L(UI.title)}</h2>
          </div>

          <div className="hiw-head-right">
            <div className="hiw-lang" role="group" aria-label={L(UI.langLabel)}>
              <button
                className={`hiw-lang-btn ${lang === "en" ? "is-on" : ""}`}
                onClick={() => changeLang("en")}
                aria-pressed={lang === "en"}
              >
                English
              </button>
              <button
                className={`hiw-lang-btn ${lang === "ne" ? "is-on" : ""}`}
                onClick={() => changeLang("ne")}
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

        <div className="hiw-body">
          <div className={`hiw-stage ${fading ? "is-fading" : ""}`}>
            <div className="hiw-stage-inner" key={stageKey}>
              {/* Clips do not autoplay for a visitor who asked for reduced
                  motion; the still first frame carries the same meaning. */}
              <SceneArt index={index} lang={lang} play={playing && !reduceMotion} />
            </div>
          </div>

          <div className={`hiw-caption ${fading ? "is-fading" : ""}`}>
            <span className="hiw-step-count">{stepLabel}</span>
            <h3>{L(scene.title)}</h3>
            <p aria-live="polite">{L(scene.body)}</p>
          </div>
        </div>

        <div className="hiw-rail">
          {SCENES.map((s, i) => (
            <button
              key={s.tag.en}
              className={`hiw-rail-item ${i === index ? "is-active" : ""} ${i < index ? "is-done" : ""}`}
              onClick={() => goTo(i)}
            >
              <span className="hiw-rail-dot" />
              {L(s.tag)}
            </button>
          ))}
        </div>

        <footer className="hiw-foot">
          <div className="hiw-controls">
            <button
              className="hiw-btn hiw-btn-ghost"
              onClick={() => goTo(Math.max(0, index - 1))}
              disabled={index === 0}
            >
              {L(UI.back)}
            </button>
            {index >= total - 1 ? (
              <button className="hiw-btn hiw-btn-ghost" onClick={replay}>
                {L(UI.again)}
              </button>
            ) : (
              <button className="hiw-btn hiw-btn-ghost" onClick={() => setPlaying((p) => !p)}>
                {playing ? L(UI.pause) : L(UI.play)}
              </button>
            )}
            <button
              className="hiw-btn hiw-btn-ghost"
              onClick={() => goTo(Math.min(total - 1, index + 1))}
              disabled={index >= total - 1}
            >
              {L(UI.next)}
            </button>
          </div>

          <div className="hiw-foot-right">
            {canSpeak ? (
              <button
                className={`hiw-btn hiw-btn-ghost hiw-audio ${narrate ? "is-on" : ""}`}
                onClick={toggleNarration}
                aria-pressed={narrate}
              >
                <SpeakerIcon on={narrate} />
                {narrate ? L(UI.narrating) : L(UI.listen)}
              </button>
            ) : null}
            <button className="hiw-btn hiw-btn-primary" onClick={onClose}>
              {L(UI.gotIt)}
            </button>
          </div>
        </footer>

        {narrate && lang === "ne" && !nepaliAvailable ? (
          <p className="hiw-voice-note">{L(UI.accentNote)}</p>
        ) : null}
      </div>
    </div>
  );
}
