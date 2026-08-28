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
 * An autoplaying, animated walkthrough of what the system actually does, shown
 * when someone presses "See How It Works" on the landing page.
 *
 * This is deliberately a *simulation*, not a recorded video: it is a few KB of
 * CSS keyframes instead of a several-MB file, it stays sharp on any screen, it
 * is readable to a screen reader, and it never goes stale when the UI changes.
 *
 * The audience is the non-technical visitor. So every caption is written in
 * plain language — "the camera reads the number plate", not "stage-2 YOLO
 * character classification" — and each scene answers one question a worried
 * vehicle owner would actually ask, in the order they would ask it.
 *
 * The whole dialog is bilingual, chosen by a single toggle: picking Nepali
 * switches every visible string — captions, step names, the labels drawn
 * inside the animations, the buttons — and narrates in Nepali. It is one
 * choice rather than a per-element mixture, because a half-translated screen
 * is harder to read than either language on its own.
 *
 * The scene list mirrors the real pipeline (processFrame in
 * controllers/cctvController.js): a camera sees a frame, the plate is located,
 * the characters are read, the text is matched against registered vehicles,
 * and a stolen match alerts the owner and the admins.
 */

type Lang = "en" | "ne";

/** A string in both languages, plus the Latin-script form used for speech on
 *  devices with no Devanagari voice. */
interface Phrase {
  en: string;
  ne: string;
  /**
   * The Nepali sentence in Latin letters. Spoken — never shown — when the
   * device has no Devanagari voice: an English voice reading Devanagari
   * produces nothing usable, while reading this produces accented but
   * understandable Nepali. Only the narrated lines need it.
   */
  neRoman?: string;
}

const t = (p: Phrase, lang: Lang): string => (lang === "ne" ? p.ne : p.en);

/* ------------------------------------------------------------------ *
 * Every visible string, in one place, so nothing can be left in
 * English by accident when the toggle flips.
 * ------------------------------------------------------------------ */
const UI = {
  kicker: { en: "How it works", ne: "यो कसरी काम गर्छ" },
  title: {
    en: "Finding a stolen vehicle, step by step",
    ne: "चोरी भएको गाडी कसरी फेला पर्छ",
  },
  close: { en: "Close", ne: "बन्द गर्नुहोस्" },
  stepOf: { en: "Step {n} of {total}", ne: "चरण {n} / {total}" },
  back: { en: "Back", ne: "पछाडि" },
  next: { en: "Next", ne: "अर्को" },
  play: { en: "Play", ne: "चलाउनुहोस्" },
  pause: { en: "Pause", ne: "रोक्नुहोस्" },
  again: { en: "Play again", ne: "फेरि हेर्नुहोस्" },
  listen: { en: "Listen", ne: "सुन्नुहोस्" },
  narrating: { en: "Narration on", ne: "आवाज चालू छ" },
  gotIt: { en: "Got it", ne: "बुझें" },
  langLabel: { en: "Language", ne: "भाषा" },
  accentNote: {
    en: "Nepali is being read by an English voice, so the accent is off — this device has no Nepali voice installed. Adding one under Windows Settings › Time & Language › Speech makes it sound natural.",
    ne: "यो यन्त्रमा नेपाली आवाज नभएकाले अङ्ग्रेजी आवाजले नेपाली पढिरहेको छ, त्यसैले उच्चारण मिलेको छैन। Windows Settings › Time & Language › Speech बाट नेपाली आवाज थप्दा राम्रो सुनिन्छ।",
  },
  /* Labels drawn inside the animations.
   *
   * The first two scenes reproduce real screens, so these are the app's own
   * strings translated — "Plate Number" is the label on VehiclesPage, "My
   * vehicle was stolen" is the option on SosPage. Keeping them identical is
   * the point: a visitor should meet the same words again after signing up. */

  // Register — VehiclesPage
  myVehicles: { en: "My Vehicles", ne: "मेरा गाडीहरू" },
  addVehicle: { en: "+ Add Vehicle", ne: "+ गाडी थप्नुहोस्" },
  plateNumber: { en: "Plate Number", ne: "नम्बर प्लेट" },
  make: { en: "Make", ne: "कम्पनी" },
  model: { en: "Model", ne: "मोडेल" },
  vYear: { en: "Year", ne: "वर्ष" },
  vColor: { en: "Color", ne: "रङ" },
  vType: { en: "Type", ne: "प्रकार" },
  typeCar: { en: "Car", ne: "कार" },
  platePhotos: { en: "Number plate photos", ne: "नम्बर प्लेटका फोटो" },
  vehiclePhotos: { en: "Vehicle photos", ne: "गाडीका फोटो" },
  angleFrontPlate: { en: "Front", ne: "अगाडि" },
  angleBackPlate: { en: "Back", ne: "पछाडि" },
  angleLeft: { en: "Left", ne: "बायाँ" },
  angleRight: { en: "Right", ne: "दायाँ" },
  registerBtn: { en: "Register", ne: "दर्ता गर्नुहोस्" },
  registered: { en: "Vehicle registered", ne: "गाडी दर्ता भयो" },

  /* Report — SosPage.
   *
   * "SOS" stays in Latin script in these two, because they are labels drawn
   * on screen and that is how the real page prints them. The *narrated*
   * lines in SCENES spell it "एस.ओ.एस." instead: a Nepali or Hindi voice
   * reads the Latin word as English "sauce", while the Devanagari letters
   * are read out correctly as the three initials. */
  emergencySos: { en: "Emergency SOS", ne: "आपत्कालीन SOS" },
  // Kept short in both languages: this one lives inside a 38px disc, and the
  // fuller "SOS पठाउनुहोस्" spilled out of it.
  sendSos: { en: "SEND SOS", ne: "SOS" },
  needHelp: { en: "I need help", ne: "मलाई सहयोग चाहियो" },
  needHelpSub: {
    en: "Breakdown, accident, feeling unsafe",
    ne: "बिग्रियो, दुर्घटना, असुरक्षित",
  },
  vehicleStolen: { en: "My vehicle was stolen", ne: "मेरो गाडी चोरी भयो" },
  vehicleStolenSub: {
    en: "Flags it so CCTV cameras watch for it",
    ne: "CCTV ले खोज्ने सूचीमा पर्छ",
  },
  vehicleField: { en: "Vehicle", ne: "गाडी" },
  lostFrom: { en: "From where vehicle was lost?", ne: "गाडी कहाँबाट हरायो?" },
  lostPlace: { en: "Ring Road, Kathmandu", ne: "रिङरोड, काठमाडौं" },
  descField: { en: "Description", ne: "विवरण" },
  descTyped: {
    en: "Taken from the parking last night",
    ne: "हिजो राति पार्किङबाट लगियो",
  },
  reportBtn: {
    en: "Report theft & alert admins",
    ne: "चोरी रिपोर्ट गर्नुहोस्",
  },
  reported: { en: "Reported stolen — cameras are watching", ne: "चोरी जनाइयो — क्यामेराले खोज्दैछ" },

  // Watch — the CCTV wall
  camMain: { en: "CAM 04 · Ring Road Junction", ne: "CAM 04 · रिङरोड चोक" },
  camA: { en: "CAM 07 · Koteshwor", ne: "CAM 07 · कोटेश्वर" },
  camB: { en: "CAM 11 · Kalanki", ne: "CAM 11 · कलंकी" },
  camC: { en: "CAM 02 · Basundhara", ne: "CAM 02 · बसुन्धरा" },
  rec: { en: "REC", ne: "REC" },
  vehicleDetected: { en: "Vehicle detected", ne: "गाडी देखियो" },
  cameraView: { en: "Camera view", ne: "क्यामेराको दृश्य" },
  readingThis: { en: "This one", ne: "यही" },
  plateRead: { en: "Plate read", ne: "पढिएको नम्बर" },
  justRead: { en: "Just read", ne: "भर्खर पढिएको" },
  comparedWith: { en: "compared with", ne: "सँग मिलाइँदै" },
  reportedStolen: { en: "Reported stolen", ne: "चोरी भएको सूची" },
  matchFound: { en: "Match found", ne: "मिल्यो" },
  vehicleSpotted: { en: "Vehicle spotted", ne: "गाडी देखियो" },
  place: { en: "Ring Road Junction · just now", ne: "रिङरोड चोक · भर्खरै" },
  ignored: { en: "Not on the list — ignored", ne: "सूचीमा छैन — छाडियो" },
  onlyStolen: {
    en: "Only vehicles their owners reported stolen are ever flagged.",
    ne: "धनीले चोरी भएको भनी जनाएका गाडी मात्र देखाइन्छ।",
  },
} satisfies Record<string, Phrase>;

interface Scene {
  tag: Phrase;
  /** Shown beside the picture, never narrated — see STEP_LEAD. So this one
   *  needs no romanized form. */
  title: Phrase;
  /** One or two plain sentences. No jargon, no feature names. */
  body: Phrase;
  /** How long this scene holds before advancing, in ms. */
  ms: number;
}

const SCENES: Scene[] = [
  {
    tag: { en: "Register", ne: "दर्ता" },
    title: {
      en: "You add your vehicle once",
      ne: "एकपटक गाडी दर्ता गर्नुहोस्",
    },
    body: {
      en: "On the My Vehicles page, press the button labelled Add Vehicle and enter your plate number, make and model, then attach photographs of the number plate and of all four sides of the vehicle. Once all of this is done, press the Register button and your vehicle is recorded in the system.",
      ne: "मेरा गाडीहरू पृष्ठमा गई “गाडी थप्नुहोस्” भन्ने बटनमा थिच्नुहोस् र नम्बर प्लेट, कम्पनी तथा मोडेल प्रविष्ट गर्नुहोस्। त्यसपछि नम्बर प्लेट र गाडीका चारै तर्फका तस्बिर संलग्न गर्नुहोस्। यी सबै काम सकिएपछि “दर्ता गर्नुहोस्” भन्ने बटनमा थिच्नुहोस्, र तपाईंको गाडी प्रणालीमा दर्ता हुनेछ।",
      neRoman:
        "Mera gaadiharu prishtha ma gayi gaadi thapnuhos bhanne button ma thichnuhos ra number plate, company tatha model pravishta garnuhos. Tyaspachhi number plate ra gaadika charai tarfaka tasbir sanlagna garnuhos. Yi sabai kaam sakiyepachhi darta garnuhos bhanne button ma thichnuhos, ra tapaiko gaadi pranali ma darta hunechha.",
    },
    // Matches the cursor walkthrough in hiw-cur-reg (9.6s) plus a beat to
    // read the toast. With narration on the voice sets the pace instead, and
    // the sentence above is written long enough to cover the same ground.
    ms: 10400,
  },
  {
    tag: { en: "Report", ne: "जानकारी" },
    title: {
      en: "If it is stolen, you press SOS",
      ne: "चोरी भयो भने एस.ओ.एस. थिच्नुहोस्",
    },
    body: {
      en: "Press the SOS button inside the red circle, then choose the option \"my vehicle was stolen\". From among the vehicles you have registered, select the one that was taken, mark on the map where it was taken from, and send the report. Once this is done, that vehicle is placed on the search list.",
      ne: "रातो गोलाकार भित्र रहेको “एस.ओ.एस.” भन्ने बटनमा थिच्नुहोस्, अनि “मेरो गाडी चोरी भयो” भन्ने विकल्प छान्नुहोस्। त्यसभित्र दर्ता गरेका गाडीहरू मध्ये हराएको गाडी छान्नुहोस्, नक्सामा कहाँबाट हरायो देखाउनुहोस् र रिपोर्ट पठाउनुहोस्। यति गरेपछि त्यो गाडी खोजी सूचीमा पर्छ।",
      neRoman:
        "Raato golaakaar bhitra raheko S O S bhanne button ma thichnuhos, ani mero gaadi chori bhayo bhanne vikalpa chhannuhos. Tyasbhitra darta gareka gaadiharu madhye harayeko gaadi chhannuhos, naksa ma kahaan baata harayo dekhaunuhos ra report pathaunuhos. Yeti gare pachhi tyo gaadi khoji suchi ma parchha.",
    },
    // Paced to hiw-cur-sos (11.2s) plus the toast.
    ms: 12000,
  },
  {
    tag: { en: "Watch", ne: "हेराइ" },
    title: {
      en: "Cameras watch every vehicle that passes",
      ne: "क्यामेराले गुड्ने हरेक गाडी हेर्छ",
    },
    body: {
      en: "Cameras placed at junctions and parking areas run day and night, and every vehicle that passes in front of a camera is tracked.",
      ne: "चोक र पार्किङमा राखिएका क्यामेरा दिनरात चल्छन् र क्यामेरा अगाडि गुड्ने सबै गाडीलाई ट्र्याक गरिरहन्छ।",
      neRoman:
        "Chowk ra parking ma raakhiyeka camera dinraat chalchhan ra camera agaadi gudne sabai gaadi lai track garirahanchha.",
    },
    ms: 8200,
  },
  {
    tag: { en: "Read", ne: "पढाइ" },
    title: {
      en: "The system reads each number plate",
      ne: "प्रणालीले हरेक नम्बर प्लेट पढ्छ",
    },
    body: {
      en: "In the images of the vehicles the cameras have tracked, the system locates the number plate and reads the letters and numbers written on it.",
      ne: "क्यामेराले ट्र्याक गरेका गाडीहरूको तस्बिरमा प्रणालीले नम्बर प्लेट खोज्छ र त्यसमा लेखिएका अक्षर र अंक पढ्छ।",
      neRoman:
        "Camera le track gareka gaadiharuko tasbir ma pranali le number plate khojchha ra tyasma lekhieka akshar ra anka padhchha.",
    },
    ms: 7200,
  },
  {
    tag: { en: "Match", ne: "मिलान" },
    title: {
      en: "It checks the plate against the list",
      ne: "नम्बर सूचीसँग मिलाइन्छ",
    },
    body: {
      en: "The plate it just read is compared with every vehicle reported stolen. This takes a fraction of a second.",
      ne: "भर्खर पढेको नम्बर चोरी भएको भनी दर्ता भएका गाडीहरूसँग मिलाइन्छ। यो काम एक सेकेन्डभन्दा कम समयमा हुन्छ।",
      neRoman:
        "Bharkhar padheko number chori bhayeko bhani darta bhayeka gaadi harusanga milaainchha. Yo kaam ek second bhanda kam samaya ma hunchha.",
    },
    ms: 6200,
  },
  {
    tag: { en: "Alert", ne: "सूचना" },
    title: {
      en: "If it matches, you know immediately",
      ne: "मिल्यो भने तुरुन्तै थाहा हुन्छ",
    },
    body: {
      en: "Your phone receives a notification carrying the photograph the camera captured and the system verified, along with the place and time it was seen. You then confirm that the vehicle is yours, and forward the notification to the concerned authority with a single tap.",
      ne: "तपाईंको मोबाइलमा क्यामेराले खिचेको र प्रणालीले प्रमाणित गरेको गाडीको तस्बिर, देखिएको ठाउँ र समयसहित सूचना आउँछ। त्यसपछि यो गाडी मेरो हो भनी पुष्टि गरेर एकै क्लिकमा सम्बन्धित निकायमा पठाउन सक्नुहुन्छ।",
      neRoman:
        "Tapaiko mobile ma camera le khicheko ra pranali le pramanit gareko gaadiko tasbir, dekhiyeko thaau ra samaya sahit suchana aauchha. Tyaspachhi yo gaadi mero ho bhani pushti garera ekai click ma sambandhit nikaya ma pathaun saknu hunchha.",
    },
    ms: 9000,
  },
  {
    tag: { en: "Safe", ne: "सुरक्षित" },
    title: {
      en: "Vehicles not on the list are ignored",
      ne: "सूचीमा नभएका गाडी बेवास्ता गरिन्छ",
    },
    body: {
      en: "Vehicles that are not on the list of those reported lost are ignored. The system searches only for vehicles reported stolen.",
      ne: "हराएको सूचीमा नभएका गाडीलाई बेवास्ता गरिन्छ। प्रणालीले चोरी भएको भनी जनाइएका गाडी मात्र खोज्छ।",
      neRoman:
        "Harayeko suchi ma nabhayeka gaadi lai bewasta garinchha. Pranali le chori bhayeko bhani janaayeka gaadi maatra khojchha.",
    },
    ms: 6400,
  },
];

/** How long the cross-fade between two scenes lasts. Long enough to read as a
 *  dissolve, short enough that it never feels like waiting. */
const FADE_MS = 420;

/**
 * What the narration says at the start of each step, in place of reading the
 * heading aloud.
 *
 * The headings are written to be *read* — short labels that make sense beside
 * the picture. Spoken one after another they were repetitive and told the
 * listener nothing about where they were in the sequence, so the voice now
 * skips them entirely and opens each step with its position instead: "first
 * of all", then "after that" for every step in between, and "finally" for the
 * last one. The headings stay on screen unchanged.
 */
/**
 * What the narration says at the start of each step, in place of reading the
 * heading aloud.
 *
 * The headings are written to be *read* — short labels that make sense beside
 * the picture. Spoken one after another they were repetitive and told the
 * listener nothing about where they were in the sequence, so the voice now
 * skips them and opens each step with its position instead. The headings stay
 * on screen unchanged.
 *
 * There is one connector per step rather than a single "after that" reused
 * five times: hearing the same two words open every step is exactly the
 * monotony that dropping the headings was meant to remove. Each is chosen for
 * what that step actually does — the plate is read *from* what the camera
 * tracked, the match happens *immediately* after the read — so the sequence
 * carries the pipeline's logic and not just its ordering. The list is indexed
 * by step, so it must stay the same length as SCENES.
 */
const STEP_LEAD: Phrase[] = [
  {
    en: "First of all,",
    ne: "सबैभन्दा सुरुमा,",
    neRoman: "Sabai bhanda suruma,",
  },
  {
    en: "After that,",
    ne: "त्यसपश्चात्,",
    neRoman: "Tyaspaschat,",
  },
  {
    en: "Meanwhile,",
    ne: "अर्कोतर्फ,",
    neRoman: "Arkotarfa,",
  },
  {
    en: "Then,",
    ne: "त्यसपछि,",
    neRoman: "Tyaspachhi,",
  },
  {
    en: "Immediately afterwards,",
    ne: "तुरुन्तै,",
    neRoman: "Turuntai,",
  },
  {
    en: "If the plate matches,",
    ne: "नम्बर मिलेमा,",
    neRoman: "Number milema,",
  },
  {
    en: "Finally,",
    ne: "अन्त्यमा,",
    neRoman: "Antya ma,",
  },
];

/**
 * Lowercases the first letter of a sentence that now follows a connector, so
 * the narration reads "First of all, on the My Vehicles page…" rather than
 * "First of all, On the…". Devanagari has no case, so Nepali is returned
 * untouched; the romanized Nepali is Latin script and does get folded.
 *
 * A word that is capitalised for its own sake is left alone — "SOS" and "CCTV"
 * are not sentence case, and lowercasing them would change what is said.
 */
const openLower = (sentence: string, lang: Lang): string => {
  if (lang === "ne" && !/^[A-Za-z]/.test(sentence)) return sentence;
  const [first = "", second = ""] = [sentence[0], sentence[1]];
  // Two capitals in a row means an acronym, not a sentence opening.
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) return sentence;
  return first.toLowerCase() + sentence.slice(1);
};

/**
 * Whether this visitor has asked their system for reduced motion.
 *
 * The stylesheet already honours the preference for everything drawn in CSS.
 * The Watch step's video is the one thing it cannot reach — no stylesheet can
 * pause a <video> — so the component reads the same query and decides not to
 * autoplay. Live, not read once: people do change this setting, and a
 * walkthrough left looping afterwards would be the exact complaint.
 */
function usePrefersReducedMotion(): boolean {
  // Seeded from a lazy initializer rather than set inside the effect. Beyond
  // avoiding the cascading render, this fixes a real defect: reading the query
  // in the effect meant the first render always said "no preference", so the
  // Watch step's video autoplayed for a frame before being told to stop — for
  // exactly the people who asked for no motion.
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

/** A breath left after each spoken sentence before moving on, so the narration
 *  does not run straight from one step into the next. */
const SPEECH_TAIL_MS = 550;

/** The registered vehicle the story follows. */
const PLATE = "BA 12 PA 3456";

/**
 * Traffic for the "Watch" scene. The target plate sits among ordinary ones so
 * the point of the next scene is obvious: the camera reads everything, and only
 * one of these turns out to matter. `hit` marks the vehicle the story follows.
 *
 * Plates stay in Latin script in both languages — that is how they are printed
 * on the vehicles themselves, and transliterating them would misrepresent what
 * the camera actually reads.
 */
const TRAFFIC = [
  { plate: "BA 21 PA 7788", hit: false, tone: "grey" },
  { plate: PLATE, hit: true, tone: "blue" },
  { plate: "GA 02 CHA 3311", hit: false, tone: "teal" },
  { plate: "BA 44 PA 9087", hit: false, tone: "grey" },
];

/**
 * The burnt-in clock on the camera tiles. Fixed rather than live: a ticking
 * real-time stamp would draw the eye away from the vehicle, and a plausible
 * night-time reading is exactly as convincing. Kept in Latin digits in both
 * languages, since that is how DVR overlays are actually printed.
 */
const CCTV_STAMP = "2026-08-24  23:41:07";

/**
 * Real ANPR output on a Kathmandu street, played in the Watch step's main
 * tile. Served from public/ rather than imported so Vite copies it untouched
 * instead of pulling 1.4MB through the bundle.
 */
const CCTV_CLIP = "/video/cctv-anpr.mp4";

export default function HowItWorksDemo({ onClose }: { onClose: () => void }) {
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
  // True during the hand-over between scenes, which drives the cross-fade.
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
  // Guards the async narration chain: a scene change, a language change or a
  // close must stop the previous line from speaking over the new one.
  const narrationIdRef = useRef(0);

  const total = SCENES.length;
  const scene = SCENES[index];
  const canSpeak = speechSupported();
  const nepaliAvailable = hasNepaliVoice(voices);
  const L = (p: Phrase) => t(p, lang);

  useEffect(() => {
    loadVoices().then((v) => {
      setVoices(v);
      // Set even when the list is empty: a device with no voices at all must
      // still narrate through the default voice rather than wait forever.
      setVoicesReady(true);
    });
  }, []);

  // Escape closes, as it does in every dialog people have used before. Focus
  // moves to the close button so keyboard users start somewhere sensible and
  // do not have to hunt for the exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    // The page behind must not scroll while a full-screen dialog is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
    // Deliberately empty: the Escape handler and scroll lock are set up once
    // for the life of the dialog.
    //
    // This used to depend on [onClose] and to call cancelSpeech() in its
    // cleanup. The parent passes onClose as an inline arrow, so it is a new
    // identity on every render of the homepage — and the homepage re-renders
    // every 1.6s from the job-card animation. The effect therefore tore down
    // and re-ran on that beat, cancelling the narration mid-sentence every
    // time. That is why the web was silent while mobile, which has no ticking
    // parent, spoke normally.
    //
    // onClose is only read inside the keydown handler, and calling last
    // render's copy is harmless: every version closes the same dialog. The
    // "voice talking to a closed page" case the old comment worried about is
    // covered by the narration effect's own cleanup, which runs on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One driver for both the picture and the sound, so the two can never
   * disagree.
   *
   * The earlier version ran narration and scene-advance as two independent
   * effects: speech started, and separately a fixed timer counted down. Since
   * no guessed duration matches how long a sentence actually takes to say, the
   * result was either dead air at the end of a scene or a sentence chopped
   * mid-word — the "next to another step" stutter.
   *
   * Now the *speech itself* is the clock. speak() resolves when the voice
   * finishes, and only then does the next scene begin. With narration off it
   * falls back to the per-scene reading time. Either way the advance goes
   * through the same fade, so there is one continuous flow rather than six
   * clips played back to back.
   */
  useEffect(() => {
    if (!playing) return;

    const runId = ++narrationIdRef.current;
    let timer: number | undefined;
    let cancelled = false;

    // Hand over to the next scene through a short fade, so the change reads as
    // a transition inside one film rather than a cut between two.
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
      // Resolves when the voice stops talking — the sentence is never cut off,
      // and there is never silence waiting for a timer to catch up.
      //
      // The heading is not spoken. What is read is the step's position
      // followed by its body, as a single utterance: two separate speak()
      // calls would put a hard gap between them, which is the stutter this
      // walkthrough is meant not to have. The comma in each connector gives
      // the voice its own short pause instead.
      // One connector per step. Falls back to the last entry if the two lists
      // ever drift apart, so a new scene narrates awkwardly rather than
      // crashing on an undefined lead.
      const lead = STEP_LEAD[index] ?? STEP_LEAD[STEP_LEAD.length - 1];

      const spoken = `${lead[lang]} ${openLower(scene.body[lang], lang)}`;
      const spokenRoman = scene.body.neRoman
        ? `${lead.neRoman} ${openLower(scene.body.neRoman, "ne")}`
        : undefined;

      speak(spoken, lang, voices, {
        romanized: spokenRoman,
        // A beat after the sentence, so scenes breathe instead of snapping.
        tailMs: SPEECH_TAIL_MS,
      }).then(advance);
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

  // Switching narration on mid-scene should start speaking straight away
  // rather than waiting for the next step to come round.
  const toggleNarration = useCallback(() => {
    setNarrate((on) => {
      cancelSpeech();
      // Bumping the id retires whatever the driver above is awaiting, so the
      // effect re-runs cleanly under the new setting.
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

  // Keyed so the CSS animations restart from the beginning on every scene
  // change; without a changing key React reuses the node and the animation
  // never replays. Language is in the key too, so switching it redraws the
  // scene with translated labels rather than leaving stale text mid-animation.
  // Deliberately NOT keyed on `playing`: pausing must freeze the scene where it
  // is, and including it would remount the stage and restart every animation
  // from the top — the opposite of a pause.
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
        aria-labelledby="hiw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hiw-head">
          <div>
            <span className="hiw-kicker">{L(UI.kicker)}</span>
            <h2 id="hiw-title">{L(UI.title)}</h2>
          </div>

          <div className="hiw-head-right">
            {/* Each option is written in its own script, always — someone who
                reads only Nepali must be able to find the Nepali switch. */}
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
            {/* Keyed so each scene's CSS animations restart from the top; the
                wrapper stays mounted so the fade has something to fade. */}
            <div className="hiw-stage-inner" key={stageKey}>
              <SceneArt index={index} lang={lang} reduceMotion={reduceMotion} />
            </div>
          </div>

          <div className={`hiw-caption ${fading ? "is-fading" : ""}`}>
            <span className="hiw-step-count">{stepLabel}</span>
            <h3>{L(scene.title)}</h3>
            {/* aria-live so a screen reader announces each new scene instead of
                the visitor sitting through a silent animation. */}
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

        {/* Only while narrating Nepali on a device with no Devanagari voice —
            the words are understandable but audibly accented, and saying so
            beats leaving someone wondering why it sounds wrong. */}
        {narrate && lang === "ne" && !nepaliAvailable ? (
          <p className="hiw-voice-note">{L(UI.accentNote)}</p>
        ) : null}
      </div>
    </div>
  );
}

const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {on ? (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </>
    ) : (
      <line x1="22" y1="9" x2="16" y2="15" />
    )}
  </svg>
);

/* ------------------------------------------------------------------ *
 * Pieces shared by the two replica-screen scenes.
 *
 * Scenes 1 and 2 are not diagrams of the app — they are the app's own
 * screens rebuilt small, with a pointer that clicks and types through them.
 * The reason is recognition: a visitor who watches someone register a vehicle
 * on the real "My Vehicles" form knows what to do when they get there, in a
 * way that no abstract phone-shaped rectangle achieves.
 *
 * Nothing here is interactive. The cursor path, the typing and the field
 * highlights are CSS keyframes on fixed delays, tuned against each other so
 * the caret starts moving when the pointer arrives and the toast lands when
 * the button is pressed. That keeps the whole walkthrough a few KB, sharp at
 * any size and readable to a screen reader.
 * ------------------------------------------------------------------ */

/** The pointer itself. `path` names the keyframe animation that walks it
 *  around a particular scene. */
const Cursor = ({ path }: { path: string }) => (
  <div className={`hiw-cursor ${path}`} aria-hidden="true">
    <svg viewBox="0 0 12 17">
      <path
        d="M1 1 L1 14.2 L4.4 11 L6.6 15.8 L8.9 14.7 L6.8 10.1 L11 10.1 Z"
        fill="#fff"
        stroke="#0b1220"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/** The ripple left behind by a click. Positioned in scene percentages so it
 *  lands exactly where the cursor path pauses. */
const Tap = ({ x, y, at }: { x: string; y: string; at: number }) => (
  <span
    className="hiw-tap"
    style={{ left: x, top: y, animationDelay: `${at}ms` }}
    aria-hidden="true"
  />
);

/**
 * A form field being filled in. `at` is when the cursor arrives, in ms from
 * the start of the scene: the focus ring fires then and the characters step
 * out over the following `dur`.
 *
 * `select` renders the same box with a dropdown chevron, for the fields the
 * real form presents as a <select> rather than a text input.
 */
function Field({
  label,
  value,
  at,
  dur = 900,
  select = false,
  area = false,
}: {
  label: string;
  value: string;
  at: number;
  /** How long the characters take to appear. */
  dur?: number;
  select?: boolean;
  area?: boolean;
}) {
  // The ring and the caret are lit from arrival until a beat after the last
  // character, then dropped — so only the field being typed into is ever
  // highlighted, as on a real form.
  const hold = dur + 500;

  return (
    <div className="hiw-ui-field">
      <label>{label}</label>
      <div
        className={`hiw-ui-input is-filling ${select ? "is-select" : ""} ${area ? "hiw-ui-textarea" : ""}`}
        style={{ animationDelay: `${at}ms`, animationDuration: `${hold}ms` }}
      >
        <span
          className="hiw-typed"
          style={{
            animationDelay: `${at}ms`,
            animationDuration: `${dur}ms`,
            // One step per character, so the reveal lands on letter
            // boundaries instead of slicing a glyph in half.
            animationTimingFunction: `steps(${Math.max(value.length, 1)}, end)`,
          }}
        >
          {value}
        </span>
        {/* Two animations share the element: the blink keeps its own rhythm,
            the window opens and closes with this field's turn. */}
        <i
          className="hiw-caret"
          style={{
            animationDelay: `${at}ms, ${at}ms`,
            animationDuration: `620ms, ${hold}ms`,
          }}
        />
      </div>
    </div>
  );
}

/** One photo slot in the upload grid, filling at `at`. */
const Slot = ({
  label,
  at,
  kind,
}: {
  label: string;
  at: number;
  kind: "plate" | "veh";
}) => (
  <div
    className={`hiw-ui-slot hiw-ui-slot-${kind} is-filled`}
    style={{ animationDelay: `${at}ms` }}
  >
    <span className="hiw-ui-slot-img" style={{ animationDelay: `${at}ms` }} />
    <em>{label}</em>
    <b className="hiw-ui-slot-tick" style={{ animationDelay: `${at + 120}ms` }}>
      ✓
    </b>
  </div>
);

/** The toast the app raises on a successful save. */
const Toast = ({
  text,
  at,
  danger = false,
}: {
  text: string;
  at: number;
  danger?: boolean;
}) => (
  <div
    className={`hiw-ui-toast ${danger ? "is-danger" : ""}`}
    style={{ animationDelay: `${at}ms` }}
  >
    <span aria-hidden="true">{danger ? "⚑" : "✓"}</span>
    {text}
  </div>
);

/**
 * The picture for each step. Every scene is plain HTML with CSS animations —
 * no canvas, no video, no images to load. Labels drawn inside follow the
 * chosen language, so nothing stays in English after the toggle flips.
 */
function SceneArt({
  index,
  lang,
  reduceMotion,
}: {
  index: number;
  lang: Lang;
  reduceMotion: boolean;
}) {
  const L = (p: Phrase) => t(p, lang);

  if (index === 0) {
    // The real "My Vehicles" page, rebuilt small. The timings below are read
    // off hiw-cur-reg: the cursor presses Add Vehicle at ~0.9s, works down
    // the three text fields, crosses the six photo slots, and hits Register
    // at ~9.0s — each element here fires as the pointer reaches it.
    return (
      <div className="hiw-art hiw-art-register">
        <div className="hiw-ui">
          <div className="hiw-ui-bar">
            <h4 className="hiw-ui-h1">{L(UI.myVehicles)}</h4>
            <span className="hiw-ui-btn">{L(UI.addVehicle)}</span>
          </div>

          <div className="hiw-ui-card hiw-reg-card">
            <div className="hiw-ui-row">
              <Field label={L(UI.plateNumber)} value={PLATE} at={2000} dur={1050} />
              <Field label={L(UI.make)} value="Honda" at={3550} dur={650} />
              <Field label={L(UI.model)} value="Shine" at={4750} dur={650} />
            </div>
            <div className="hiw-ui-row">
              <Field label={L(UI.vYear)} value="2021" at={5500} dur={420} />
              <Field label={L(UI.vColor)} value="Red" at={5700} dur={380} />
              <Field label={L(UI.vType)} value={L(UI.typeCar)} at={5900} dur={380} select />
            </div>

            {/* Two plate shots and four vehicle sides — the same six the real
                form asks for, filling left to right as the cursor crosses. */}
            <div className="hiw-ui-photos">
              <div className="hiw-ui-photo-group">
                <span className="hiw-ui-photo-title">{L(UI.platePhotos)}</span>
                <div className="hiw-ui-slots">
                  <Slot label={L(UI.angleFrontPlate)} at={6100} kind="plate" />
                  <Slot label={L(UI.angleBackPlate)} at={6560} kind="plate" />
                </div>
              </div>
              <div className="hiw-ui-photo-group">
                <span className="hiw-ui-photo-title">{L(UI.vehiclePhotos)}</span>
                <div className="hiw-ui-slots">
                  <Slot label={L(UI.angleFrontPlate)} at={7020} kind="veh" />
                  <Slot label={L(UI.angleBackPlate)} at={7420} kind="veh" />
                  <Slot label={L(UI.angleLeft)} at={7820} kind="veh" />
                  <Slot label={L(UI.angleRight)} at={8220} kind="veh" />
                </div>
              </div>
            </div>

            <span className="hiw-ui-btn hiw-ui-btn-wide">{L(UI.registerBtn)}</span>
          </div>

          <Toast text={L(UI.registered)} at={9250} />
        </div>

        {/* Clicks: Add Vehicle, then Register. */}
        <Tap x="83%" y="8%" at={870} />
        <Tap x="14%" y="82%" at={8980} />
        <Cursor path="hiw-cursor-reg" />
      </div>
    );
  }

  if (index === 1) {
    // The real SOS page. This one action matters more than it looks: filing
    // the theft report is what sets vehicle.status = "stolen", and that flag
    // is the only thing the camera pipeline matches against — without it a
    // stolen vehicle is never detected.
    //
    // Both branches of the choice are drawn, and only the theft one is taken,
    // so the scene shows that an SOS is not automatically a theft report.
    return (
      <div className="hiw-art hiw-art-sos">
        <div className="hiw-ui">
          <div className="hiw-ui-bar">
            <h4 className="hiw-ui-h1">{L(UI.emergencySos)}</h4>
          </div>

          <div className="hiw-sos-hero">
            <div className="hiw-sos-big">{L(UI.sendSos)}</div>
            <div className="hiw-sos-choice">
              <div className="hiw-sos-option" style={{ animationDelay: "1700ms" }}>
                <strong>{L(UI.needHelp)}</strong>
                <span>{L(UI.needHelpSub)}</span>
              </div>
              <div
                className="hiw-sos-option is-chosen"
                style={{ animationDelay: "1700ms, 2600ms" }}
              >
                <strong>{L(UI.vehicleStolen)}</strong>
                <span>{L(UI.vehicleStolenSub)}</span>
              </div>
            </div>
          </div>

          <div className="hiw-ui-card hiw-report-card">
            <Field label={L(UI.vehicleField)} value={PLATE} at={4100} dur={800} select />

            <div className="hiw-ui-field">
              <label>{L(UI.lostFrom)}</label>
              <div className="hiw-ui-map">
                {/* Dropped where the cursor clicks, then labelled with the
                    address the picker resolves. */}
                <span className="hiw-ui-pin" style={{ animationDelay: "6100ms" }} />
                <span className="hiw-ui-map-label" style={{ animationDelay: "6500ms" }}>
                  {L(UI.lostPlace)}
                </span>
              </div>
            </div>

            <Field label={L(UI.descField)} value={L(UI.descTyped)} at={7600} dur={1700} area />

            <span className="hiw-ui-btn hiw-ui-btn-danger hiw-ui-btn-wide">
              {L(UI.reportBtn)}
            </span>
          </div>

          <Toast text={L(UI.reported)} at={10700} danger />
        </div>

        {/* Clicks: SOS, the theft option, the map, the report button. */}
        <Tap x="50%" y="14%" at={1550} />
        <Tap x="73%" y="33%" at={2500} />
        <Tap x="46%" y="68%" at={6050} />
        <Tap x="33%" y="94%" at={10400} />
        <Cursor path="hiw-cursor-sos" />
      </div>
    );
  }

  if (index === 2) {
    // A CCTV wall as an operator sees one: camera IDs, a running clock, REC on
    // the feed the story follows.
    //
    // The main tile plays real recogniser output on a Kathmandu street. What
    // was here before was a drawn approach — a shape growing towards a CSS
    // vanishing point — and it was honest about the *idea* but not about the
    // product: it showed a cartoon car and one green box, where the real thing
    // boxes every vehicle in dense traffic, classifies helmets, and pulls
    // zoomed crops of hand-painted Devanagari plates. That last detail is the
    // entire argument for training on Nepali plates rather than using a
    // general-purpose reader, and no amount of CSS was going to make it.
    //
    // The two smaller tiles stay simulated. They exist to say "this is a
    // network, not one camera", and three copies of the same clip would say
    // the opposite.
    return (
      <div className="hiw-art hiw-art-watch">
        <div className="hiw-cctv">
          <div className="hiw-cam-tile">
            {/* Muted and looping: the clip carries no audio worth hearing, and
                this dialog may already be narrating in the visitor's ear.
                playsInline stops iOS Safari taking it fullscreen on play.

                Autoplay is dropped for a visitor who has asked for reduced
                motion — a looping video is the clearest case that preference
                covers. They get the first frame, which is still boxed traffic,
                plus browser controls to start it themselves if they want. */}
            <video
              className="hiw-cam-video"
              src={CCTV_CLIP}
              autoPlay={!reduceMotion}
              controls={reduceMotion}
              muted
              loop={!reduceMotion}
              playsInline
              preload="metadata"
              /* Decorative while it plays itself: the caption beside it
                 already says what it shows, and a screen reader announcing a
                 silent loop adds nothing. Once it carries controls it is a
                 real control and must not be hidden from that reader. */
              aria-hidden={reduceMotion ? undefined : "true"}
            />
            <span className="hiw-cam-label">
              <i className="hiw-cam-live" />
              {L(UI.camMain)}
            </span>
            <span className="hiw-cam-rec">
              <i />
              {L(UI.rec)}
            </span>
            <span className="hiw-cam-clock">{CCTV_STAMP}</span>
          </div>

          {/* The rest of the network, quietly doing the same thing. */}
          <div className="hiw-cctv-side">
            {[UI.camA, UI.camB, UI.camC].map((cam, i) => (
              <div className={`hiw-cam-tile ${i === 1 ? "is-noisy" : ""}`} key={cam.en}>
                <span className="hiw-cam-label">
                  <i className="hiw-cam-live" />
                  {L(cam)}
                </span>
                <div className="hiw-cam-mini">
                  <div className="hiw-cam-mini-road" />
                  <span
                    className={`hiw-cam-mini-veh ${i === 1 ? "is-rtl" : ""}`}
                    style={{ animationDelay: `${i * 1.9}s`, animationDuration: `${5 + i}s` }}
                  />
                  <span
                    className={`hiw-cam-mini-veh ${i === 2 ? "is-rtl" : ""}`}
                    style={{ animationDelay: `${2.6 + i}s`, animationDuration: `${6 + i}s` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (index === 3) {
    // The same traffic, now being read. Every plate gets a box — the system
    // reads them all — but only the registered one is followed through to the
    // readout, which is what sets up the matching step.
    return (
      <div className="hiw-art hiw-art-read">
        <div className="hiw-frame">
          <span className="hiw-frame-tag">{L(UI.cameraView)}</span>
          <div className="hiw-scan" />

          <div className="hiw-read-row">
            {TRAFFIC.map((v, i) => (
              <div
                className={`hiw-read-plate ${v.hit ? "is-target" : ""}`}
                key={v.plate}
                style={{ animationDelay: `${700 + i * 320}ms` }}
              >
                {v.plate}
                {v.hit ? <span className="hiw-read-tag">{L(UI.readingThis)}</span> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="hiw-readout">
          <span className="hiw-readout-label">{L(UI.plateRead)}</span>
          <span className="hiw-plate-text">
            {PLATE.split("").map((c, i) => (
              <b key={i} style={{ animationDelay: `${2300 + i * 95}ms` }}>
                {c === " " ? " " : c}
              </b>
            ))}
          </span>
        </div>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="hiw-art hiw-art-match">
        <div className="hiw-compare">
          <div className="hiw-chip hiw-chip-read">
            <span>{L(UI.justRead)}</span>
            <strong>{PLATE}</strong>
          </div>
          <div className="hiw-vs">{L(UI.comparedWith)}</div>
          <div className="hiw-list">
            <span className="hiw-list-title">{L(UI.reportedStolen)}</span>
            <div className="hiw-list-row">BA 09 CHA 1122</div>
            <div className="hiw-list-row">GA 19 PA 4630</div>
            <div className="hiw-list-row is-hit">{PLATE}</div>
            <div className="hiw-list-row">BA 44 PA 9087</div>
          </div>
        </div>
        <div className="hiw-verdict">{L(UI.matchFound)}</div>
      </div>
    );
  }

  if (index === 5) {
    return (
      <div className="hiw-art hiw-art-alert">
        <div className="hiw-phone hiw-phone-alert">
          <div className="hiw-phone-notch" />
          <div className="hiw-notif">
            <div className="hiw-notif-head">
              <span className="hiw-notif-dot" />
              {L(UI.vehicleSpotted)}
            </div>
            <strong>{PLATE}</strong>
            <span className="hiw-notif-meta">{L(UI.place)}</span>
            <div className="hiw-notif-shot" />
          </div>
        </div>
        <div className="hiw-ping">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  return (
    <div className="hiw-art hiw-art-safe">
      <div className="hiw-pass-row">
        {TRAFFIC.filter((v) => !v.hit).map((v, i) => (
          <div className="hiw-pass" style={{ animationDelay: `${i * 700}ms` }} key={v.plate}>
            <span>{v.plate}</span>
            <em>{L(UI.ignored)}</em>
          </div>
        ))}
      </div>
      <p className="hiw-safe-note">{L(UI.onlyStolen)}</p>
    </div>
  );
}
