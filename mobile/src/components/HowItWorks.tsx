import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type * as Speech from "expo-speech";
import { useVideoPlayer, VideoView } from "expo-video";
import { cancelSpeech, hasNepaliVoice, loadVoices, speak } from "../lib/speak";
import { colors, radius, spacing } from "../theme";

/**
 * Real ANPR output on a Kathmandu street — the recogniser boxing vehicles and
 * reading plates in live traffic. Cropped from a 1080p screen recording to the
 * tile's own shape and re-encoded to a few MB; see the Watch step below.
 */
const CCTV_CLIP = require("../../assets/video/cctv-anpr.mp4");

/**
 * "How it works" — the mobile counterpart of the web app's HowItWorksDemo.
 *
 * Same seven steps, same wording in both languages, same narration: what the
 * cameras do, in the order a worried vehicle owner would ask about it. The
 * delivery is rebuilt for touch rather than ported:
 *
 *   - The web version animates a mouse pointer clicking through the real forms.
 *     A phone has no cursor, so the register and report steps show the actual
 *     mobile screens instead, with the tapped control highlighted — a pointer
 *     drawn on a touch device would depict an interaction that does not exist.
 *   - Steps advance by swiping the pager or tapping Next, not only on a timer.
 *     Autoplay still runs, and any manual move stops it, because someone who
 *     has started steering should not be fought by a timer.
 *   - The stage is sized from the window rather than a fixed pixel height, so
 *     it works from a small phone to a tablet.
 *
 * Narration is the same contract as the web: speak() resolves when the voice
 * stops, and the walkthrough advances on that rather than on a guessed
 * duration, so a sentence is never cut off mid-word.
 */

type Lang = "en" | "ne";

interface Phrase {
  en: string;
  ne: string;
  /** The Nepali line in Latin letters — spoken, never shown, on a device with
   *  no Devanagari voice. See src/lib/speak.ts. */
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
  done: { en: "Got it", ne: "बुझें" },
  accentNote: {
    en: "This device has no Nepali voice installed, so the narration is being read by an English voice and the accent is off.",
    ne: "यो यन्त्रमा नेपाली आवाज नभएकाले अङ्ग्रेजी आवाजले पढिरहेको छ, त्यसैले उच्चारण मिलेको छैन।",
  },

  // Register — the Vehicles screen
  myVehicles: { en: "My Vehicles", ne: "मेरा गाडीहरू" },
  addVehicle: { en: "+ Add Vehicle", ne: "+ गाडी थप्नुहोस्" },
  plateNumber: { en: "Plate Number", ne: "नम्बर प्लेट" },
  make: { en: "Make", ne: "कम्पनी" },
  model: { en: "Model", ne: "मोडेल" },
  platePhotos: { en: "Number plate photos", ne: "नम्बर प्लेटका फोटो" },
  vehiclePhotos: { en: "Vehicle photos", ne: "गाडीका फोटो" },
  angleFront: { en: "Front", ne: "अगाडि" },
  angleBack: { en: "Back", ne: "पछाडि" },
  angleLeft: { en: "Left", ne: "बायाँ" },
  angleRight: { en: "Right", ne: "दायाँ" },
  registerBtn: { en: "Register", ne: "दर्ता गर्नुहोस्" },
  registered: { en: "Vehicle registered", ne: "गाडी दर्ता भयो" },

  /* Report — the SOS screen. "SOS" stays Latin here because it is a label
     drawn on screen and that is how the real screen prints it; the narrated
     lines spell it "एस.ओ.एस.", since a Nepali voice reads the Latin word as
     English "sauce". */
  emergencySos: { en: "Emergency SOS", ne: "आपत्कालीन SOS" },
  sendSos: { en: "SOS", ne: "SOS" },
  needHelp: { en: "I need help", ne: "मलाई सहयोग चाहियो" },
  vehicleStolen: { en: "My vehicle was stolen", ne: "मेरो गाडी चोरी भयो" },
  vehicleField: { en: "Vehicle", ne: "गाडी" },
  lostFrom: { en: "Where was it taken from?", ne: "कहाँबाट हरायो?" },
  lostPlace: { en: "Ring Road, Kathmandu", ne: "रिङरोड, काठमाडौं" },
  reportBtn: { en: "Report theft", ne: "चोरी रिपोर्ट गर्नुहोस्" },
  reported: { en: "Reported — cameras are watching", ne: "जनाइयो — क्यामेराले खोज्दैछ" },
  tapHere: { en: "Tap", ne: "थिच्नुहोस्" },

  // Watch — the CCTV wall
  camMain: { en: "CAM 04 · Ring Road Junction", ne: "CAM 04 · रिङरोड चोक" },
  camA: { en: "CAM 07 · Koteshwor", ne: "CAM 07 · कोटेश्वर" },
  camB: { en: "CAM 11 · Kalanki", ne: "CAM 11 · कलंकी" },
  rec: { en: "REC", ne: "REC" },
  /* No "Vehicle detected" string here any more: the Watch step now plays real
     recogniser output, and the boxes and labels in that footage are the
     model's own. Drawing a translated caption over them would be claiming
     credit for a label the video already carries. */

  // Read / Match / Alert / Safe
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
  /** Shown beside the picture, never narrated — see STEP_LEAD. */
  title: Phrase;
  body: Phrase;
  /** How long this scene holds before advancing when narration is off. */
  ms: number;
}

/* The wording is identical to the web walkthrough, deliberately: a visitor who
   watches this on the phone and then opens the site should meet the same
   explanation, not a paraphrase of it. */
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
    ms: 10400,
  },
  {
    tag: { en: "Report", ne: "जानकारी" },
    title: {
      en: "If it is stolen, you press SOS",
      ne: "चोरी भयो भने एस.ओ.एस. थिच्नुहोस्",
    },
    body: {
      en: 'Press the SOS button inside the red circle, then choose the option "my vehicle was stolen". From among the vehicles you have registered, select the one that was taken, mark on the map where it was taken from, and send the report. Once this is done, that vehicle is placed on the search list.',
      ne: "रातो गोलाकार भित्र रहेको “एस.ओ.एस.” भन्ने बटनमा थिच्नुहोस्, अनि “मेरो गाडी चोरी भयो” भन्ने विकल्प छान्नुहोस्। त्यसभित्र दर्ता गरेका गाडीहरू मध्ये हराएको गाडी छान्नुहोस्, नक्सामा कहाँबाट हरायो देखाउनुहोस् र रिपोर्ट पठाउनुहोस्। यति गरेपछि त्यो गाडी खोजी सूचीमा पर्छ।",
      neRoman:
        "Raato golaakaar bhitra raheko S O S bhanne button ma thichnuhos, ani mero gaadi chori bhayo bhanne vikalpa chhannuhos. Tyasbhitra darta gareka gaadiharu madhye harayeko gaadi chhannuhos, naksa ma kahaan baata harayo dekhaunuhos ra report pathaunuhos. Yeti gare pachhi tyo gaadi khoji suchi ma parchha.",
    },
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

/**
 * What the narration says at the start of each step, in place of reading the
 * heading aloud. One per step rather than a single connector reused five
 * times, each chosen for what that step actually does — so the sequence
 * carries the pipeline's logic and not just its ordering. Indexed by step, so
 * it must stay the same length as SCENES.
 */
const STEP_LEAD: Phrase[] = [
  { en: "First of all,", ne: "सबैभन्दा सुरुमा,", neRoman: "Sabai bhanda suruma," },
  { en: "After that,", ne: "त्यसपश्चात्,", neRoman: "Tyaspaschat," },
  { en: "Meanwhile,", ne: "अर्कोतर्फ,", neRoman: "Arkotarfa," },
  { en: "Then,", ne: "त्यसपछि,", neRoman: "Tyaspachhi," },
  { en: "Immediately afterwards,", ne: "तुरुन्तै,", neRoman: "Turuntai," },
  { en: "If the plate matches,", ne: "नम्बर मिलेमा,", neRoman: "Number milema," },
  { en: "Finally,", ne: "अन्त्यमा,", neRoman: "Antya ma," },
];

/**
 * Lowercases the opening letter of a sentence that now follows a connector, so
 * the narration reads "First of all, on the My Vehicles page…" rather than
 * "First of all, On the…". Devanagari has no case; an acronym (SOS, CCTV) is
 * left alone, since lowercasing it would change what is said.
 */
const openLower = (sentence: string, lang: Lang): string => {
  if (lang === "ne" && !/^[A-Za-z]/.test(sentence)) return sentence;
  const first = sentence[0] ?? "";
  const second = sentence[1] ?? "";
  if (second && /[A-Z]/.test(second) && second === second.toUpperCase()) return sentence;
  return first.toLowerCase() + sentence.slice(1);
};

/** A breath left after each spoken sentence, so scenes do not snap. */
const SPEECH_TAIL_MS = 550;

/** The registered vehicle the story follows. */
const PLATE = "BA 12 PA 3456";

/** Traffic for the camera scenes. `hit` marks the vehicle the story follows. */
const TRAFFIC = [
  { plate: "BA 21 PA 7788", hit: false },
  { plate: PLATE, hit: true },
  { plate: "GA 02 CHA 3311", hit: false },
];

export default function HowItWorks({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [narrate, setNarrate] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);

  /* Guards the async narration chain: a step change, a language change or a
     close must stop the previous line from speaking over the new one. */
  const runRef = useRef(0);

  const total = SCENES.length;
  const scene = SCENES[index];
  const L = (p: Phrase) => t(p, lang);
  const nepaliAvailable = hasNepaliVoice(voices);

  useEffect(() => {
    let alive = true;
    loadVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
      // Leaving mid-sentence must not leave a voice talking to a closed screen.
      cancelSpeech();
    };
  }, []);

  /* Keep the pager and the step in step when the change came from a button
     rather than a swipe. */
  useEffect(() => {
    pager.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  /**
   * One driver for both the picture and the sound, so the two cannot disagree.
   *
   * With narration on, the speech is the clock: speak() resolves when the voice
   * finishes and only then does the next step begin, so a sentence is never cut
   * off and there is never dead air waiting for a timer. With it off, the
   * per-scene reading time is used instead.
   */
  useEffect(() => {
    if (!playing) return;

    const run = ++runRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const advance = () => {
      if (runRef.current !== run) return;
      if (index >= total - 1) {
        setPlaying(false);
        return;
      }
      setIndex((i) => i + 1);
    };

    if (narrate) {
      // The heading is not spoken — see STEP_LEAD. Connector and body go as a
      // single utterance: two speak() calls would put a hard gap between them.
      const lead = STEP_LEAD[index] ?? STEP_LEAD[STEP_LEAD.length - 1];
      const spoken = `${lead[lang]} ${openLower(scene.body[lang], lang)}`;
      const spokenRoman = scene.body.neRoman
        ? `${lead.neRoman} ${openLower(scene.body.neRoman, "ne")}`
        : undefined;

      void speak(spoken, lang, voices, {
        romanized: spokenRoman,
        tailMs: SPEECH_TAIL_MS,
      }).then(advance);
    } else {
      timer = setTimeout(advance, scene.ms);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
    // scene is derived from index; listing index covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, narrate, lang, voices, total]);

  /** Any manual move stops autoplay — someone steering should not be fought. */
  const goTo = useCallback((next: number) => {
    cancelSpeech();
    runRef.current++;
    setPlaying(false);
    setIndex(next);
  }, []);

  const toggleNarration = useCallback(() => {
    cancelSpeech();
    runRef.current++;
    setNarrate((on) => !on);
  }, []);

  const changeLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      cancelSpeech();
      runRef.current++;
      setLang(next);
    },
    [lang]
  );

  const replay = useCallback(() => {
    cancelSpeech();
    runRef.current++;
    setIndex(0);
    setPlaying(true);
  }, []);

  const stepLabel = L(UI.stepOf)
    .replace("{n}", String(index + 1))
    .replace("{total}", String(total));

  const atEnd = index >= total - 1;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.kicker}>{L(UI.kicker)}</Text>
            <Text style={styles.title}>{L(UI.title)}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={L(UI.close)}
            // A 44pt target, the platform minimum — the glyph alone is far
            // smaller than a thumb.
            hitSlop={12}
          >
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        </View>

        {/* Each option is written in its own script, always — someone who reads
            only Nepali must be able to find the Nepali switch. */}
        <View style={styles.langRow}>
          {(["en", "ne"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => changeLang(l)}
              accessibilityRole="button"
              accessibilityState={{ selected: lang === l }}
              style={[styles.langBtn, lang === l && styles.langBtnOn]}
            >
              <Text style={[styles.langText, lang === l && styles.langTextOn]}>
                {l === "en" ? "English" : "नेपाली"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Swipeable pager. Paging is the gesture people already use for a
            step-by-step sequence on a phone; the buttons below stay for anyone
            who does not reach for it. */}
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== index) goTo(next);
          }}
          style={styles.pager}
        >
          {SCENES.map((s, i) => (
            <View key={s.tag.en} style={[styles.page, { width }]}>
              <View style={styles.stage}>
                {/* Keyed on language too, so switching redraws the scene with
                    translated labels rather than leaving stale text. */}
                <SceneArt key={`${i}-${lang}`} index={i} lang={lang} active={i === index} />
              </View>

              <View style={styles.caption}>
                <Text style={styles.stepCount}>
                  {L(UI.stepOf).replace("{n}", String(i + 1)).replace("{total}", String(total))}
                </Text>
                <Text style={styles.captionTitle}>{t(s.title, lang)}</Text>
                <Text style={styles.captionBody}>{t(s.body, lang)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Progress rail. Scrolls, because seven Nepali step names do not fit
            across a phone. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {SCENES.map((s, i) => (
            <Pressable
              key={s.tag.en}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              style={[styles.railItem, i === index && styles.railItemOn]}
            >
              <View
                style={[
                  styles.railDot,
                  i < index && styles.railDotDone,
                  i === index && styles.railDotOn,
                ]}
              />
              <Text style={[styles.railText, i === index && styles.railTextOn]}>
                {t(s.tag, lang)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {narrate && lang === "ne" && !nepaliAvailable ? (
          <Text style={styles.voiceNote}>{L(UI.accentNote)}</Text>
        ) : null}

        <View style={styles.foot}>
          <View style={styles.footRow}>
            <FootBtn
              label={L(UI.back)}
              onPress={() => goTo(Math.max(0, index - 1))}
              disabled={index === 0}
            />
            {atEnd ? (
              <FootBtn label={L(UI.again)} onPress={replay} />
            ) : (
              <FootBtn
                label={playing ? L(UI.pause) : L(UI.play)}
                onPress={() => {
                  if (playing) {
                    cancelSpeech();
                    runRef.current++;
                  }
                  setPlaying((p) => !p);
                }}
              />
            )}
            <FootBtn
              label={L(UI.next)}
              onPress={() => goTo(Math.min(total - 1, index + 1))}
              disabled={atEnd}
            />
          </View>

          <View style={styles.footRow}>
            <FootBtn
              label={narrate ? L(UI.narrating) : L(UI.listen)}
              onPress={toggleNarration}
              icon={narrate ? "🔊" : "🔈"}
              on={narrate}
              grow
            />
            <FootBtn label={L(UI.done)} onPress={onClose} primary grow />
          </View>
        </View>

        {/* Announced to a screen reader, which cannot see the animation. */}
        <View accessibilityLiveRegion="polite" style={styles.srOnly}>
          <Text>{`${stepLabel}. ${L(scene.title)}. ${L(scene.body)}`}</Text>
        </View>
      </View>
    </Modal>
  );
}

function FootBtn({
  label,
  onPress,
  disabled,
  primary,
  on,
  icon,
  grow,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  on?: boolean;
  icon?: string;
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!on }}
      style={({ pressed }) => [
        styles.footBtn,
        grow && styles.footBtnGrow,
        primary && styles.footBtnPrimary,
        on && styles.footBtnOn,
        disabled && styles.footBtnOff,
        pressed && !disabled && styles.footBtnPressed,
      ]}
    >
      <Text
        style={[
          styles.footBtnText,
          primary && styles.footBtnTextPrimary,
          on && styles.footBtnTextOn,
        ]}
        numberOfLines={1}
      >
        {icon ? `${icon}  ` : ""}
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * The picture for each step.
 *
 * `active` gates the looping animations: only the step on screen runs one, so
 * a seven-page pager is not driving seven animation loops at once.
 * ------------------------------------------------------------------ */
function SceneArt({ index, lang, active }: { index: number; lang: Lang; active: boolean }) {
  const L = (p: Phrase) => t(p, lang);

  if (index === 0) return <RegisterArt L={L} />;
  if (index === 1) return <ReportArt L={L} />;
  if (index === 2) return <WatchArt L={L} active={active} />;
  if (index === 3) return <ReadArt L={L} active={active} />;
  if (index === 4) return <MatchArt L={L} />;
  if (index === 5) return <AlertArt L={L} active={active} />;
  return <SafeArt L={L} />;
}

type Lx = (p: Phrase) => string;

/**
 * A value that eases from 0 to 1 once the component mounts, used to stage a
 * scene's elements in sequence. `delay` is when this particular piece joins.
 */
function useReveal(delay: number, enabled = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v, delay, enabled]);
  return v;
}

/** One staged element: fades and lifts into place at `delay`. */
function Reveal({
  delay,
  children,
  style,
}: {
  delay: number;
  children: React.ReactNode;
  style?: object;
}) {
  const v = useReveal(delay);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* 1 · Register — the Vehicles screen, filling in ------------------------- */
function RegisterArt({ L }: { L: Lx }) {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>{L(UI.myVehicles)}</Text>
        <Reveal delay={0}>
          <View style={[styles.pill, styles.pillBlue]}>
            <Text style={styles.pillText}>{L(UI.addVehicle)}</Text>
          </View>
        </Reveal>
      </View>

      <Reveal delay={300} style={styles.formCard}>
        <FakeField label={L(UI.plateNumber)} value={PLATE} delay={600} />
        <View style={styles.fieldRow}>
          <FakeField label={L(UI.make)} value="Honda" delay={1000} flex />
          <FakeField label={L(UI.model)} value="Shine" delay={1300} flex />
        </View>

        <Text style={styles.photoTitle}>{L(UI.platePhotos)}</Text>
        <View style={styles.slotRow}>
          <PhotoSlot label={L(UI.angleFront)} delay={1600} />
          <PhotoSlot label={L(UI.angleBack)} delay={1800} />
        </View>

        <Text style={styles.photoTitle}>{L(UI.vehiclePhotos)}</Text>
        <View style={styles.slotRow}>
          <PhotoSlot label={L(UI.angleFront)} delay={2000} vehicle />
          <PhotoSlot label={L(UI.angleBack)} delay={2150} vehicle />
          <PhotoSlot label={L(UI.angleLeft)} delay={2300} vehicle />
          <PhotoSlot label={L(UI.angleRight)} delay={2450} vehicle />
        </View>

        <Reveal delay={2700}>
          <Pressed label={L(UI.registerBtn)} tone="blue" />
        </Reveal>
      </Reveal>

      <Reveal delay={3100} style={styles.toastWrap}>
        <View style={styles.toast}>
          <Text style={styles.toastText}>✓ {L(UI.registered)}</Text>
        </View>
      </Reveal>
    </View>
  );
}

/** A form field whose value appears at `delay`, as if just typed. */
function FakeField({
  label,
  value,
  delay,
  flex,
}: {
  label: string;
  value: string;
  delay: number;
  flex?: boolean;
}) {
  const v = useReveal(delay);
  return (
    <View style={[styles.field, flex && styles.fieldFlex]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View
        style={[
          styles.fieldBox,
          {
            borderColor: v.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.slate200, colors.blue600],
            }),
          },
        ]}
      >
        <Animated.Text style={[styles.fieldValue, { opacity: v }]} numberOfLines={1}>
          {value}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

/** A photo slot that fills at `delay`. */
function PhotoSlot({
  label,
  delay,
  vehicle,
}: {
  label: string;
  delay: number;
  vehicle?: boolean;
}) {
  const v = useReveal(delay);
  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.slotFill, vehicle && styles.slotFillVeh, { opacity: v }]}>
        <View style={vehicle ? styles.slotVehShape : styles.slotPlateShape} />
      </Animated.View>
      <Text style={styles.slotLabel} numberOfLines={1}>
        {label}
      </Text>
      <Animated.Text style={[styles.slotTick, { opacity: v }]}>✓</Animated.Text>
    </View>
  );
}

/** A control drawn in its pressed state — the touch equivalent of the web
 *  walkthrough's cursor click. */
function Pressed({ label, tone }: { label: string; tone: "blue" | "red" }) {
  return (
    <View style={[styles.pressedBtn, tone === "red" && styles.pressedBtnRed]}>
      <Text style={styles.pressedText}>{label}</Text>
    </View>
  );
}

/* 2 · Report — the SOS screen -------------------------------------------- */
function ReportArt({ L }: { L: Lx }) {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.appBar}>
        <Text style={styles.appBarTitle}>{L(UI.emergencySos)}</Text>
      </View>

      <View style={styles.sosHero}>
        <SosPulse label={L(UI.sendSos)} />
      </View>

      {/* Both branches drawn, only the theft one taken — so the scene shows
          that an SOS is not automatically a theft report. */}
      <Reveal delay={700} style={styles.choiceRow}>
        <View style={styles.choice}>
          <Text style={styles.choiceText}>{L(UI.needHelp)}</Text>
        </View>
        <View style={[styles.choice, styles.choiceOn]}>
          <Text style={[styles.choiceText, styles.choiceTextOn]}>{L(UI.vehicleStolen)}</Text>
        </View>
      </Reveal>

      <Reveal delay={1200} style={styles.formCard}>
        <FakeField label={L(UI.vehicleField)} value={PLATE} delay={1500} />
        <Text style={styles.fieldLabel}>{L(UI.lostFrom)}</Text>
        <View style={styles.miniMap}>
          <Reveal delay={2000}>
            <View style={styles.pin} />
          </Reveal>
          <Text style={styles.mapLabel}>{L(UI.lostPlace)}</Text>
        </View>
        <Reveal delay={2400}>
          <Pressed label={L(UI.reportBtn)} tone="red" />
        </Reveal>
      </Reveal>

      <Reveal delay={2800} style={styles.toastWrap}>
        <View style={[styles.toast, styles.toastDanger]}>
          <Text style={[styles.toastText, styles.toastTextDanger]}>⚑ {L(UI.reported)}</Text>
        </View>
      </Reveal>
    </View>
  );
}

/** The SOS control, pulsing the way an emergency control should. */
function SosPulse({ label }: { label: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [v]);

  return (
    <View style={styles.sosWrap}>
      <Animated.View
        style={[
          styles.sosRing,
          {
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) },
            ],
          },
        ]}
      />
      <View style={styles.sosBtn}>
        <Text style={styles.sosText}>{label}</Text>
      </View>
    </View>
  );
}

/* 3 · Watch — a CCTV wall ------------------------------------------------ */
function WatchArt({ L, active }: { L: Lx; active: boolean }) {
  return (
    <View style={styles.cctvWrap}>
      <View style={styles.camMain}>
        <CctvFootage active={active} />
        {/* Drawn after the video so the burnt-in labels sit over it. */}
        <CamChrome label={L(UI.camMain)} rec />
      </View>
      <View style={styles.camSide}>
        {[UI.camA, UI.camB].map((c, i) => (
          <View style={styles.camMini} key={c.en}>
            <CamChrome label={L(c)} small />
            <View style={styles.miniRoad} />
            {/* Something has to move on these, or they read as dead panels
                rather than as the rest of a live network. */}
            <MiniTraffic active={active} reverse={i === 1} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** A vehicle crossing one of the quiet tiles, side on and small. */
function MiniTraffic({ active, reverse }: { active: boolean; reverse?: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: reverse ? 7000 : 5600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, v, reverse]);

  const translateX = v.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [110, -24] : [-24, 110],
  });

  return <Animated.View style={[styles.miniVeh, { transform: [{ translateX }] }]} />;
}

/** The burnt-in overlay every camera tile carries. */
function CamChrome({ label, rec, small }: { label: string; rec?: boolean; small?: boolean }) {
  return (
    <>
      <View style={styles.camLabelRow}>
        <View style={styles.camLive} />
        <Text style={[styles.camLabel, small && styles.camLabelSm]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {rec ? (
        <View style={styles.camRec}>
          <View style={styles.camRecDot} />
          <Text style={styles.camRecText}>REC</Text>
        </View>
      ) : null}
    </>
  );
}

/**
 * The main camera tile: real footage of the recogniser running on a Kathmandu
 * street.
 *
 * This replaces a CSS-style simulation — a shape driving towards a drawn
 * vanishing point — that was here first. The simulation was honest about the
 * *idea* but not about the product: it showed a cartoon car and a green box,
 * while the actual output is the recogniser boxing every vehicle in a busy
 * frame, classifying helmets, and pulling a zoomed crop of a hand-painted
 * Devanagari plate. Nothing drawn in code was going to make that case as well
 * as the thing itself.
 *
 * The clip is muted and loops. It carries no audio worth hearing, and this
 * screen may already be narrating in the user's ear — a second sound source
 * would fight it.
 *
 * Playback is tied to `active`, so the video only runs while its step is the
 * one on screen. A seven-page pager decoding video on a page nobody is looking
 * at is wasted battery, and on a low-end Android it is a stutter in the pager
 * itself.
 */
function CctvFootage({ active }: { active: boolean }) {
  const player = useVideoPlayer(CCTV_CLIP, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Dips the picture to black for a moment as the clip wraps.
  //
  // The step runs as long as the narration does, so a short clip has to loop —
  // but a hard cut from the last frame back to the first is exactly what makes
  // it read as "the video restarted". A quick dip through black reads instead
  // as a camera switching angle, which is what CCTV does anyway. Nothing about
  // the loop changes; only the seam is hidden.
  const seam = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    player.play();

    // playToEnd fires as the clip wraps, which is the frame to cover.
    const sub = player.addListener("playToEnd", () => {
      Animated.sequence([
        Animated.timing(seam, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(seam, {
          toValue: 0,
          duration: 380,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => sub.remove();
  }, [active, player, seam]);

  return (
    <View style={styles.footageWrap}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        // "contain", not "cover". The tile is 16:9 and so is the clip, so the
        // two agree and there are no bars to hide — but a rounding difference
        // under "cover" is resolved by zooming in, and at this size that
        // magnifies the street until only one vehicle is left in frame.
        contentFit="contain"
        nativeControls={false}
        // A walkthrough step is not a video the user is meant to scrub, take
        // fullscreen, or send to a TV.
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {/* The loop seam. Sits over the picture, so the wrap happens behind it. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.loopSeam, { opacity: seam }]}
      />
      {/* A faint interlace over the picture. Real footage still benefits from
          the one artefact that says "this is a monitor, not a photo" — and it
          ties the tile to the two simulated feeds beside it. */}
      <View pointerEvents="none" style={styles.scanOverlay} />
    </View>
  );
}

/* 4 · Read — every plate in frame being read ------------------------------ */
function ReadArt({ L, active }: { L: Lx; active: boolean }) {
  return (
    <View style={styles.phoneScreen}>
      <View style={styles.readFrame}>
        <Text style={styles.frameTag}>{L(UI.cameraView)}</Text>
        <ScanLine active={active} />

        {/* All of the traffic gets boxed, because the recogniser really does
            read every plate it sees — showing only the registered one implied
            the camera somehow knows which vehicle to look at before reading
            it. Only the match is highlighted and carried down to the readout,
            which is what sets up the next step. */}
        <View style={styles.readPlateList}>
          {TRAFFIC.map((v, i) => (
            <Reveal key={v.plate} delay={300 + i * 260}>
              <View style={[styles.readPlateBox, v.hit && styles.readPlateBoxHit]}>
                <Text style={[styles.readPlateText, v.hit && styles.readPlateTextHit]}>
                  {v.plate}
                </Text>
                {v.hit ? (
                  <View style={styles.readPlateTag}>
                    <Text style={styles.readPlateTagText}>{L(UI.readingThis)}</Text>
                  </View>
                ) : null}
              </View>
            </Reveal>
          ))}
        </View>
      </View>

      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>{L(UI.plateRead)}</Text>
        <View style={styles.charRow}>
          {PLATE.split("").map((c, i) =>
            c === " " ? (
              <View key={i} style={styles.charSpace} />
            ) : (
              <Reveal key={i} delay={1250 + i * 90}>
                <View style={styles.charBox}>
                  <Text style={styles.charText}>{c}</Text>
                </View>
              </Reveal>
            )
          )}
        </View>
      </View>
    </View>
  );
}

/** The sweep that says "this is being scanned". */
function ScanLine({ active }: { active: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);

  return (
    <Animated.View
      style={[
        styles.scanLine,
        { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 128] }) }] },
      ]}
    />
  );
}

/* 5 · Match — the comparison --------------------------------------------- */
function MatchArt({ L }: { L: Lx }) {
  return (
    <View style={styles.phoneScreen}>
      <Reveal delay={0} style={styles.chip}>
        <Text style={styles.chipLabel}>{L(UI.justRead)}</Text>
        <Text style={styles.chipPlate}>{PLATE}</Text>
      </Reveal>

      <Text style={styles.vsText}>{L(UI.comparedWith)}</Text>

      <Reveal delay={300} style={styles.listCard}>
        <Text style={styles.listTitle}>{L(UI.reportedStolen)}</Text>
        {["BA 09 CHA 1122", PLATE, "GA 19 PA 4630"].map((plate) => {
          const hit = plate === PLATE;
          return (
            <View key={plate} style={[styles.listRow, hit && styles.listRowHit]}>
              <Text style={[styles.listRowText, hit && styles.listRowTextHit]}>{plate}</Text>
              {hit ? <Text style={styles.listTick}>✓</Text> : null}
            </View>
          );
        })}
      </Reveal>

      <Reveal delay={900}>
        <View style={styles.verdict}>
          <Text style={styles.verdictText}>{L(UI.matchFound)}</Text>
        </View>
      </Reveal>
    </View>
  );
}

/* 6 · Alert — the notification ------------------------------------------- */
function AlertArt({ L, active }: { L: Lx; active: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);

  return (
    <View style={styles.phoneScreen}>
      <View style={styles.notifWrap}>
        <Animated.View
          style={[
            styles.notifPing,
            {
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] }) }],
            },
          ]}
        />
        <Reveal delay={200}>
          <View style={styles.notif}>
            <View style={styles.notifHead}>
              <View style={styles.notifDot} />
              <Text style={styles.notifTitle}>{L(UI.vehicleSpotted)}</Text>
            </View>
            <Text style={styles.notifPlate}>{PLATE}</Text>
            <Text style={styles.notifMeta}>{L(UI.place)}</Text>
            <View style={styles.notifShot} />
          </View>
        </Reveal>
      </View>
    </View>
  );
}

/* 7 · Safe — everyone else is passed over -------------------------------- */
function SafeArt({ L }: { L: Lx }) {
  return (
    <View style={styles.phoneScreen}>
      {TRAFFIC.filter((v) => !v.hit).map((v, i) => (
        <Reveal key={v.plate} delay={i * 400} style={styles.passRow}>
          <Text style={styles.passPlate}>{v.plate}</Text>
          <Text style={styles.passNote}>{L(UI.ignored)}</Text>
        </Reveal>
      ))}
      <Reveal delay={900}>
        <Text style={styles.safeNote}>{L(UI.onlyStolen)}</Text>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy950 },

  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.sm,
  },
  headText: { flex: 1, paddingRight: spacing.md },
  kicker: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { color: "#fff", fontSize: 19, fontWeight: "800", marginTop: 4 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1b2a4a",
  },
  closeMark: { color: "#cbd5e1", fontSize: 22, lineHeight: 24 },

  langRow: { flexDirection: "row", gap: 6, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  langBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#16294f",
  },
  langBtnOn: { backgroundColor: colors.blue700 },
  langText: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  langTextOn: { color: "#fff" },

  pager: { flexGrow: 0 },
  page: { paddingHorizontal: spacing.lg },
  stage: {
    // The register and report scenes carry a full form plus a submit button
    // and a toast. At the 250 this started as, both were clipped off the
    // bottom of the frame — and the submit button is the one control those
    // scenes exist to show being pressed.
    height: 320,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#1b2a4a",
    backgroundColor: "#0c1730",
    overflow: "hidden",
  },
  caption: { paddingTop: spacing.md },
  stepCount: { color: "#64748b", fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  captionTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 4 },
  captionBody: { color: "#94a3b8", fontSize: 13.5, lineHeight: 21, marginTop: 6 },

  rail: { paddingHorizontal: spacing.lg, gap: 5, paddingVertical: spacing.sm },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    // Deliberately below the 44pt guidance: the rail is a redundant shortcut
    // — the pager swipes and the Back/Next buttons underneath are both full
    // targets — and pills big enough to satisfy it crowded out the picture
    // they are meant to navigate.
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: "#111f3b",
  },
  railItemOn: { backgroundColor: colors.blue700 },
  railDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  railDotDone: { backgroundColor: colors.green500 },
  railDotOn: { backgroundColor: "#fff" },
  railText: { color: "#94a3b8", fontSize: 11.5, fontWeight: "700" },
  railTextOn: { color: "#fff" },

  voiceNote: {
    color: "#fbbf24",
    fontSize: 11.5,
    lineHeight: 17,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },

  foot: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#152b4a",
  },
  footRow: { flexDirection: "row", gap: spacing.sm },
  footBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#223357",
  },
  footBtnGrow: { flex: 1 },
  footBtnPrimary: { backgroundColor: colors.blue700, borderColor: colors.blue700 },
  footBtnOn: { backgroundColor: "#134e2a", borderColor: colors.green500 },
  footBtnOff: { opacity: 0.4 },
  footBtnPressed: { opacity: 0.75 },
  footBtnText: { color: "#cbd5e1", fontSize: 13, fontWeight: "700" },
  footBtnTextPrimary: { color: "#fff" },
  footBtnTextOn: { color: "#86efac" },

  // Off-screen, for the screen reader only.
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0, left: -9999 },

  /* --- scene chrome --- */
  phoneScreen: { flex: 1, padding: spacing.md, gap: 6 },
  appBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  appBarTitle: { color: "#fff", fontSize: 13, fontWeight: "800" },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.sm },
  pillBlue: { backgroundColor: colors.blue700 },
  pillText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  formCard: {
    backgroundColor: "#0f1c33",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#1b2a4a",
    padding: spacing.sm,
    gap: 6,
  },
  fieldRow: { flexDirection: "row", gap: 6 },
  field: { gap: 3 },
  fieldFlex: { flex: 1 },
  fieldLabel: {
    color: "#64748b",
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  fieldBox: {
    height: 22,
    borderWidth: 1,
    borderRadius: 5,
    backgroundColor: "#0a1425",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  fieldValue: { color: "#e2e8f0", fontSize: 11, fontWeight: "700" },

  photoTitle: { color: "#94a3b8", fontSize: 8.5, fontWeight: "800", marginTop: 2 },
  slotRow: { flexDirection: "row", gap: 5 },
  slot: {
    flex: 1,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#2f6b4a",
    backgroundColor: "#0a1425",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotFill: { ...StyleSheet.absoluteFillObject, backgroundColor: "#16294f", alignItems: "center", justifyContent: "center" },
  slotFillVeh: { backgroundColor: "#1c3348" },
  slotPlateShape: { width: "52%", height: 6, borderRadius: 1, backgroundColor: "#e2e8f0", marginTop: 13 },
  slotVehShape: { width: "54%", height: 8, borderRadius: 3, backgroundColor: "#64748b", marginTop: 11 },
  slotLabel: {
    color: "#e2e8f0",
    fontSize: 7.5,
    fontWeight: "700",
    // Its own plate behind it: the label lies over the photo fill, and a text
    // shadow alone left it washed out against the pale plate shape.
    backgroundColor: "rgba(4,10,20,0.72)",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    overflow: "hidden",
  },
  slotTick: { position: "absolute", top: 1, right: 3, color: colors.green500, fontSize: 9, fontWeight: "800" },

  pressedBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.blue600,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.sm,
    // Drawn in its pressed state — the touch equivalent of the web
    // walkthrough's cursor click, which a phone cannot show.
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  pressedBtnRed: { backgroundColor: colors.red500 },
  pressedText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  toastWrap: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md },
  toast: {
    alignSelf: "flex-end",
    backgroundColor: "#0d2a1c",
    borderWidth: 1,
    borderColor: "#256b47",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  toastDanger: { backgroundColor: "#2a1114", borderColor: "#7f1d24" },
  toastText: { color: "#86efac", fontSize: 10.5, fontWeight: "800" },
  toastTextDanger: { color: "#fecaca" },

  /* --- SOS --- */
  sosHero: { alignItems: "center", paddingVertical: 2 },
  sosWrap: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  sosRing: { position: "absolute", width: 54, height: 54, borderRadius: 27, backgroundColor: colors.red500 },
  sosBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.red500,
    alignItems: "center",
    justifyContent: "center",
  },
  sosText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },

  choiceRow: { flexDirection: "row", gap: 6 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#223357",
    borderRadius: 7,
    backgroundColor: "#0f1c33",
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  choiceOn: { borderColor: colors.red500, backgroundColor: "rgba(239,68,68,0.12)" },
  choiceText: { color: "#cbd5e1", fontSize: 9.5, fontWeight: "700" },
  choiceTextOn: { color: "#fecaca" },

  miniMap: {
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#223357",
    backgroundColor: "#0a1425",
    alignItems: "center",
    justifyContent: "center",
  },
  pin: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red500 },
  mapLabel: { position: "absolute", left: 5, bottom: 3, color: "#94a3b8", fontSize: 8 },

  /* --- CCTV --- */
  cctvWrap: { flex: 1, gap: 5, padding: 6, backgroundColor: "#070d18" },
  /* 4:3, matching the clip. Not 16:9: the recogniser draws its zoomed plate
     crops along the top of frame while the vehicles they belong to sit near
     the bottom, and a widescreen band could hold one or the other but not
     both — the first cut showed rooftops with the road gone. */
  camMain: {
    aspectRatio: 4 / 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#1b2a4a",
    backgroundColor: "#0a1120",
    overflow: "hidden",
  },
  camSide: { flex: 1, flexDirection: "row", gap: 5 },
  camMini: { flex: 1, borderRadius: 6, borderWidth: 1, borderColor: "#1b2a4a", backgroundColor: "#0a1120", overflow: "hidden" },
  camMiniPair: { flex: 1 },
  miniRoad: { position: "absolute", left: 0, right: 0, bottom: 0, height: "52%", backgroundColor: "#141d30" },
  miniVeh: {
    position: "absolute",
    bottom: "16%",
    left: 0,
    width: 17,
    height: 8,
    borderRadius: 2,
    backgroundColor: "#46536b",
  },
  camLabelRow: { position: "absolute", top: 4, left: 5, right: 5, zIndex: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  camLive: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.green500 },
  camLabel: { color: "#cbd5e1", fontSize: 8.5, fontWeight: "700", flexShrink: 1 },
  camLabelSm: { fontSize: 7.5 },
  camRec: { position: "absolute", top: 4, right: 5, zIndex: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  camRecDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.red500 },
  camRecText: { color: "#fca5a5", fontSize: 7.5, fontWeight: "900", letterSpacing: 0.8 },

  footageWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05080f" },
  /* A single translucent wash rather than a striped gradient: RN has no
     repeating-linear-gradient, and over real footage the effect only needs to
     knock the picture back a little so the burnt-in labels stay legible. */
  scanOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,14,26,0.16)" },
  loopSeam: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05080f" },

  /* --- Read --- */
  readFrame: {
    height: 132,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#223357",
    backgroundColor: "#0a1425",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  frameTag: { position: "absolute", top: 5, left: 7, color: "#64748b", fontSize: 8.5, fontWeight: "700" },
  scanLine: { position: "absolute", left: 0, right: 0, top: 0, height: 2, backgroundColor: "rgba(34,211,238,0.7)" },
  readPlateList: { alignItems: "center", gap: 5 },
  readPlateBox: {
    borderWidth: 1,
    borderColor: "#3b5185",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  // The match: brighter border and a ring, so it stands out from the traffic
  // around it without the others looking switched off.
  readPlateBoxHit: {
    borderWidth: 2,
    borderColor: "rgba(52,211,153,0.9)",
    backgroundColor: "rgba(22,163,74,0.12)",
  },
  readPlateText: { color: "#94a3b8", fontSize: 11.5, fontWeight: "900", letterSpacing: 0.8 },
  readPlateTextHit: { color: "#fff", fontSize: 12.5 },
  // Sits to the right of its own plate rather than above it: stacked, the tag
  // falls into the gap between two rows and reads as a label for the wrong
  // vehicle — the bug this scene had on the web first.
  readPlateTag: {
    position: "absolute",
    left: "100%",
    marginLeft: 5,
    top: 2,
    backgroundColor: colors.green500,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  readPlateTagText: { color: "#06210f", fontSize: 7.5, fontWeight: "800" },

  readout: { marginTop: spacing.md, gap: 5 },
  readoutLabel: { color: "#64748b", fontSize: 9, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  charRow: { flexDirection: "row", gap: 3, flexWrap: "wrap" },
  charBox: { width: 17, height: 22, borderRadius: 3, backgroundColor: "#16294f", alignItems: "center", justifyContent: "center" },
  charText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  charSpace: { width: 7 },

  /* --- Match --- */
  chip: { backgroundColor: "#0f1c33", borderRadius: radius.sm, borderWidth: 1, borderColor: "#223357", padding: spacing.sm },
  chipLabel: { color: "#64748b", fontSize: 8.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  chipPlate: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.8, marginTop: 2 },
  vsText: { color: "#64748b", fontSize: 9.5, textAlign: "center", marginVertical: 3 },
  listCard: { backgroundColor: "#0f1c33", borderRadius: radius.sm, borderWidth: 1, borderColor: "#223357", padding: spacing.sm, gap: 3 },
  listTitle: { color: "#64748b", fontSize: 8.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  listRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, backgroundColor: "#0a1425" },
  listRowHit: { backgroundColor: "rgba(22,163,74,0.16)", borderWidth: 1, borderColor: colors.green500 },
  listRowText: { color: "#94a3b8", fontSize: 10.5, fontWeight: "700" },
  listRowTextHit: { color: "#86efac" },
  listTick: { color: colors.green500, fontSize: 11, fontWeight: "900" },
  verdict: { alignSelf: "center", marginTop: spacing.sm, backgroundColor: colors.green500, paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill },
  verdictText: { color: "#fff", fontSize: 12, fontWeight: "900" },

  /* --- Alert --- */
  notifWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  notifPing: { position: "absolute", width: 150, height: 110, borderRadius: 20, backgroundColor: colors.red500 },
  notif: { width: 190, backgroundColor: "#0f1c33", borderRadius: radius.sm, borderWidth: 1, borderColor: "#223357", padding: spacing.md, gap: 3 },
  notifHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  notifDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red500 },
  notifTitle: { color: "#fecaca", fontSize: 10, fontWeight: "800" },
  notifPlate: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
  notifMeta: { color: "#64748b", fontSize: 9 },
  notifShot: { height: 34, borderRadius: 5, backgroundColor: "#16294f", marginTop: 3 },

  /* --- Safe --- */
  passRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0f1c33",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "#223357",
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginBottom: 6,
  },
  passPlate: { color: "#cbd5e1", fontSize: 12, fontWeight: "800" },
  passNote: { color: "#64748b", fontSize: 9.5 },
  safeNote: { color: "#94a3b8", fontSize: 11.5, lineHeight: 18, textAlign: "center", marginTop: spacing.sm },
});
