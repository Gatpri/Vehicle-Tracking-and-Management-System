import { useCallback, useEffect, useRef, useState } from "react";
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
 * "Getting a vehicle serviced" — the mobile counterpart of the web app's
 * ServicingDemo, and the twin of HowItWorks in this same folder.
 *
 * Deliberately built to the same shape as HowItWorks: same modal shell, same
 * language toggle, same narration contract, same swipeable pager. Someone who
 * has watched one walkthrough should not have to learn a second interface to
 * watch the other.
 *
 * Four of the eight steps play real workshop footage. Those clips are cut from
 * a single continuous recording, and where they are cut matters: the source
 * shows a mechanic stripping, replacing and refitting parts in one unbroken
 * run, which is NOT how this system works. A workshop here may only inspect
 * and quote; the spanners come out after the customer has approved the parts
 * and paid. So the footage is split at those seams and each fragment is placed
 * against the stage it belongs to, with the estimate and payment steps in
 * between. Playing the clip whole would teach a sequence the software forbids.
 *
 * The scene list mirrors the state machine in
 * backend_api/constants/bookingWorkflow.js (delivery path).
 */

/* The four cut fragments. Required at module scope, not built at render: the
   bundler resolves these to asset ids at build time. */
const CLIP_ARRIVE = require("../../assets/video/svc-arrive.mp4");
const CLIP_DIAGNOSE = require("../../assets/video/svc-diagnose.mp4");
const CLIP_REPAIR = require("../../assets/video/svc-repair.mp4");
const CLIP_HANDOVER = require("../../assets/video/svc-handover.mp4");

type Lang = "en" | "ne";

interface Phrase {
  en: string;
  ne: string;
  /** The Nepali line in Latin letters — spoken, never shown, on a device with
   *  no Devanagari voice. See src/lib/speak.ts. */
  neRoman?: string;
}

const t = (p: Phrase, lang: Lang): string => (lang === "ne" ? p.ne : p.en);

const UI = {
  kicker: { en: "How it works", ne: "यो कसरी काम गर्छ" },
  title: {
    en: "Getting a vehicle serviced, step by step",
    ne: "गाडी सर्भिस गराउने प्रक्रिया, चरणबद्ध",
  },
  close: { en: "Close", ne: "बन्द गर्नुहोस्" },
  stepOf: { en: "Step {n} of {total}", ne: "चरण {n} / {total}" },
  back: { en: "Back", ne: "पछाडि" },
  next: { en: "Next", ne: "अगाडि" },
  play: { en: "Play", ne: "चलाउनुहोस्" },
  pause: { en: "Pause", ne: "रोक्नुहोस्" },
  again: { en: "Watch again", ne: "फेरि हेर्नुहोस्" },
  listen: { en: "Listen", ne: "सुन्नुहोस्" },
  narrating: { en: "Narrating", ne: "बोल्दैछ" },
  done: { en: "Done", ne: "भयो" },
  accentNote: {
    en: "This device has no Nepali voice, so the narration is read with an English accent.",
    ne: "यो यन्त्रमा नेपाली स्वर नभएकाले अङ्ग्रेजी उच्चारणमा पढिन्छ।",
  },
} satisfies Record<string, Phrase>;

interface Scene {
  tag: Phrase;
  /** Shown beside the picture, never narrated — see STEP_LEAD. */
  title: Phrase;
  body: Phrase;
  /** Reading time when narration is off, in ms. */
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
      en: "Open the Workshops tab and you will see the garages near you, with their rating and the services each one offers. Choose one, pick the service your vehicle needs, and send the booking. The workshop receives it straight away.",
      ne: "वर्कशप ट्याब खोल्नुहोस्, त्यहाँ तपाईंको नजिकका ग्यारेजहरू, तिनको रेटिङ र प्रत्येकले दिने सेवाहरू देखिन्छन्। एउटा छान्नुहोस्, गाडीलाई चाहिने सेवा रोज्नुहोस् र बुकिङ पठाउनुहोस्। वर्कशपले तुरुन्तै त्यो प्राप्त गर्छ।",
      neRoman:
        "Workshop tab kholnuhos, tyahaan tapaiko najikka garage haru, tinko rating ra pratyekle dine sewa haru dekhinchhan. Euta chhannuhos, gaadi lai chahine sewa rojnuhos ra booking pathaunuhos. Workshop le turuntai tyo prapta garchha.",
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
      en: "The rider hands the vehicle over at the garage and the booking moves to dropped. From this moment the workshop is responsible for it, and you can see that change on your bookings screen.",
      ne: "राइडरले ग्यारेजमा गाडी बुझाउँछ र बुकिङ “ड्रप्ड” अवस्थामा पुग्छ। यही क्षणदेखि गाडीको जिम्मेवारी वर्कशपको हुन्छ, र यो परिवर्तन तपाईंको बुकिङ स्क्रिनमा देखिन्छ।",
      neRoman:
        "Rider le garage ma gaadi bujhauchha ra booking dropped awastha ma pugchha. Yahi kshan dekhi gaadi ko jimmewari workshop ko hunchha, ra yo parivartan tapaiko booking screen ma dekhinchha.",
    },
    ms: 8500,
  },
  {
    tag: { en: "Inspect", ne: "जाँच" },
    title: {
      en: "The mechanic finds what is worn",
      ne: "मेकानिकले बिग्रेको भाग पत्ता लगाउँछ",
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
      en: "The parts list reaches you first",
      ne: "पहिले पार्ट्सको सूची तपाईंकहाँ आउँछ",
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

/**
 * One connector per step, spoken ahead of the body so the steps join up rather
 * than each starting cold. Must stay the same length as SCENES.
 */
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

/**
 * Lowercases the opening letter so a connector can be glued in front. An
 * acronym is left alone — "SOS" must not become "sOS".
 */
const openLower = (sentence: string, lang: Lang): string => {
  if (lang === "ne" && !/^[A-Za-z]/.test(sentence)) return sentence;
  const [first = "", second = ""] = [sentence[0], sentence[1]];
  if (second && second === second.toUpperCase() && /[A-Z]/.test(second)) return sentence;
  return first.toLowerCase() + sentence.slice(1);
};

/** A breath after each spoken sentence, so steps do not run into each other. */
const SPEECH_TAIL_MS = 550;

/** Fixed sample values for the illustrated steps. Never the reader's own
 *  vehicle: this is a demonstration, not a report on their booking. */
const SAMPLE_PLATE = "BA 12 PA 3456";

/**
 * A workshop clip.
 *
 * Muted always — the walkthrough may be narrating in the user's ear and a
 * second sound source would fight it. Playback is tied to `active` so only the
 * page on screen decodes video; an eight-page pager decoding four videos at
 * once is wasted battery and, on a low-end Android, a stutter in the pager.
 */
function Clip({ source, active }: { source: number; active: boolean }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Dips through black as the clip wraps. These fragments are 1.6–2.6s, so a
  // step lasting a whole narrated sentence loops several times; a hard cut back
  // to frame one reads as a glitch, a quick dip reads as an edit.
  const seam = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      player.pause();
      return;
    }
    player.play();

    // Held so the dip can be stopped if the step changes mid-animation.
    let dip: Animated.CompositeAnimation | undefined;

    const sub = player.addListener("playToEnd", () => {
      dip = Animated.sequence([
        Animated.timing(seam, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(seam, {
          toValue: 0,
          duration: 360,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
      dip.start();
    });

    return () => {
      sub.remove();
      // Without this a swipe landing mid-dip leaves the animation running
      // against a paused page and, worse, can strand the overlay at full
      // opacity — a black rectangle sitting over the video with nothing left
      // to fade it back out. Resetting the value is what actually clears it;
      // stopAnimation alone would freeze it wherever it had reached.
      dip?.stop();
      seam.setValue(0);
    };
  }, [active, player, seam]);

  return (
    <View style={styles.clipWrap}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        // "cover": the clips are 16:9 and the stage is taller, so "contain"
        // would letterbox them into a thin strip in the middle of the frame.
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <Animated.View pointerEvents="none" style={[styles.loopSeam, { opacity: seam }]} />
    </View>
  );
}

/** A caption pinned over a clip, naming the stage the footage belongs to. */
function ClipLabel({ text }: { text: string }) {
  return (
    <View style={styles.clipLabel} pointerEvents="none">
      <Text style={styles.clipLabelText}>{text}</Text>
    </View>
  );
}

/** The picture for one step. Four play footage; four are drawn. */
function SceneArt({ index, lang, active }: { index: number; lang: Lang; active: boolean }) {
  const s = (en: string, ne: string) => (lang === "ne" ? ne : en);

  // 1 — picking a workshop
  if (index === 0) {
    const shops = [
      { n: s("Bikers Moto", "बाइकर्स मोटो"), r: "4.9" },
      { n: s("City Garage", "सिटी ग्यारेज"), r: "4.6" },
      { n: s("Highway Motors", "हाइवे मोटर्स"), r: "4.4" },
    ];
    return (
      <View style={styles.art}>
        {shops.map((w, i) => (
          <View key={w.n} style={[styles.shopRow, i === 0 && styles.shopRowPicked]}>
            <Text style={styles.shopName}>{w.n}</Text>
            <Text style={styles.shopRate}>★ {w.r}</Text>
          </View>
        ))}
        <View style={styles.bookBtn}>
          <Text style={styles.bookBtnText}>{s("Book service", "सर्भिस बुक")}</Text>
        </View>
      </View>
    );
  }

  // 2 — the rider crossing the map
  if (index === 1) {
    return (
      <View style={[styles.art, styles.artCentre]}>
        <View style={styles.mapRow}>
          <View style={styles.mapPin}>
            <Text style={styles.mapPinText}>{s("You", "तपाईं")}</Text>
          </View>
          <View style={styles.mapLine} />
          <View style={styles.riderDot} />
          <View style={styles.mapLine} />
          <View style={styles.mapPin}>
            <Text style={styles.mapPinText}>{s("Workshop", "वर्कशप")}</Text>
          </View>
        </View>
        <Text style={styles.artNote}>
          {s("Live location while the rider is on the way", "राइडर बाटोमा हुँदा प्रत्यक्ष स्थान")}
        </Text>
      </View>
    );
  }

  // 3 — arrival at the workshop
  if (index === 2) {
    return (
      <>
        <Clip source={CLIP_ARRIVE} active={active} />
        <ClipLabel text={s("Dropped at workshop", "वर्कशपमा बुझाइयो")} />
      </>
    );
  }

  // 4 — inspection. Nothing is replaced here, and the label says so.
  if (index === 3) {
    return (
      <>
        <Clip source={CLIP_DIAGNOSE} active={active} />
        <ClipLabel text={s("Inspecting — nothing replaced yet", "जाँच — अझै केही फेरिएको छैन")} />
      </>
    );
  }

  // 5 — the quote, with one line struck out by the customer
  if (index === 4) {
    const rows = [
      { p: s("Brake pads", "ब्रेक प्याड"), on: true },
      { p: s("Air filter", "एयर फिल्टर"), on: true },
      { p: s("Engine oil", "इन्जिन तेल"), on: true },
      { p: s("Chain set", "चेन सेट"), on: false },
    ];
    return (
      <View style={styles.art}>
        <Text style={styles.artHead}>{s("Parts estimate", "पार्ट्स अनुमान")}</Text>
        {rows.map((r) => (
          <View key={r.p} style={[styles.quoteRow, !r.on && styles.quoteRowOff]}>
            <View style={[styles.quoteBox, !r.on && styles.quoteBoxOff]} />
            <Text style={[styles.quoteName, !r.on && styles.quoteNameOff]}>{r.p}</Text>
            <View style={styles.quoteBar} />
          </View>
        ))}
        <Text style={styles.artNote}>
          {s("You choose what stays", "के राख्ने तपाईं छान्नुहोस्")}
        </Text>
      </View>
    );
  }

  // 6 — payment releasing the repair
  if (index === 5) {
    return (
      <View style={[styles.art, styles.artCentre]}>
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>{s("Wallet", "वालेट")}</Text>
          <View style={styles.walletTrack}>
            <View style={styles.walletFill} />
          </View>
        </View>
        <View style={styles.unlockRow}>
          <View style={styles.unlockDot}>
            <Text style={styles.unlockTick}>✓</Text>
          </View>
          <Text style={styles.unlockText}>{s("Repair unlocked", "मर्मत खुल्यो")}</Text>
        </View>
      </View>
    );
  }

  // 7 — the work itself, which only happens after step 6
  if (index === 6) {
    return (
      <>
        <Clip source={CLIP_REPAIR} active={active} />
        <ClipLabel text={s("Approved — parts being fitted", "स्वीकृत — पार्ट्स जडान हुँदै")} />
      </>
    );
  }

  // 8 — handed back
  return (
    <>
      <Clip source={CLIP_HANDOVER} active={active} />
      <ClipLabel text={`${s("Returned to you", "तपाईंलाई फिर्ता")} · ${SAMPLE_PLATE}`} />
    </>
  );
}

export default function ServicingWalkthrough({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [narrate, setNarrate] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);

  /* Retires an in-flight narration when the step, language or screen changes,
     so the previous line cannot speak over the new one. */
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

  /* True while a scroll this component started is still settling. Without it,
     the momentum-end from a programmatic scrollTo is indistinguishable from a
     user swipe — and if the window width changes mid-flight (a rotation), the
     landed offset divides to a DIFFERENT page than the one being scrolled to,
     firing a spurious goTo that jumps the reader backwards and silently stops
     autoplay. */
  const selfScroll = useRef(false);

  /* Keeps the pager and the step together when the move came from a button
     rather than a swipe. */
  useEffect(() => {
    selfScroll.current = true;
    pager.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  /**
   * One driver for both picture and sound, so the two cannot disagree. With
   * narration on the voice is the clock — speak() resolves when it stops, and
   * only then does the next step begin, so a sentence is never cut off. With it
   * off, the scene's own reading time is used.
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
            hitSlop={12}
          >
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        </View>

        {/* Each option in its own script, always — someone who reads only
            Nepali must be able to find the Nepali switch. */}
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

        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // A drag beginning is the one unambiguous signal that the human is
          // driving, so it clears the programmatic flag.
          onScrollBeginDrag={() => {
            selfScroll.current = false;
          }}
          onMomentumScrollEnd={(e) => {
            if (selfScroll.current) {
              selfScroll.current = false;
              return;
            }
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== index) goTo(next);
          }}
          style={styles.pager}
        >
          {SCENES.map((s, i) => (
            <View key={s.tag.en} style={[styles.page, { width }]}>
              <View style={styles.stage}>
                {/* Keyed on the index ONLY, deliberately not on language.
                    HowItWorks keys on language because its scenes hold running
                    animations that must restart with the new labels. These
                    scenes render their text straight from the `lang` prop, so
                    React updates them on its own — and adding lang to the key
                    would tear down and rebuild all four video players on every
                    toggle of the language switch, which is both a visible
                    flicker and a real leak risk on Android. */}
                <SceneArt key={i} index={i} lang={lang} active={i === index} />
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

        {/* Scrolls, because eight Nepali step names do not fit across a phone. */}
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
        disabled && styles.footBtnDisabled,
        pressed && !disabled && styles.footBtnPressed,
      ]}
    >
      <Text
        style={[
          styles.footBtnText,
          primary && styles.footBtnTextPrimary,
          on && styles.footBtnTextOn,
          disabled && styles.footBtnTextDisabled,
        ]}
      >
        {icon ? `${icon}  ` : ""}
        {label}
      </Text>
    </Pressable>
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

  langRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
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

  /* ---- Footage ---- */
  clipWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "#05080f" },
  loopSeam: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  clipLabel: {
    position: "absolute",
    left: spacing.md,
    bottom: spacing.md,
    backgroundColor: "rgba(10,17,32,0.85)",
    borderWidth: 1,
    borderColor: "#2c3f66",
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  clipLabelText: { color: "#e2e8f0", fontSize: 11, fontWeight: "700" },

  /* ---- Drawn scenes ---- */
  art: { flex: 1, padding: spacing.lg, gap: 8, justifyContent: "center" },
  artCentre: { alignItems: "center", justifyContent: "center", gap: spacing.lg },
  artHead: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  artNote: { color: "#93b4fc", fontSize: 11.5, fontWeight: "600", marginTop: 6 },

  shopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: "#101d38",
    borderWidth: 1,
    borderColor: "#1e2f52",
  },
  shopRowPicked: { borderColor: colors.blue600 },
  shopName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  shopRate: { color: "#fbbf24", fontSize: 12.5, fontWeight: "700" },
  bookBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.blue700,
  },
  bookBtnText: { color: "#fff", fontSize: 12.5, fontWeight: "800" },

  mapRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mapPin: {
    backgroundColor: "#101d38",
    borderWidth: 1,
    borderColor: "#2c3f66",
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  mapPinText: { color: "#cbd5e1", fontSize: 11, fontWeight: "700" },
  mapLine: { width: 34, height: 2, borderRadius: 2, backgroundColor: "#2c3f66" },
  riderDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.orange500,
    borderWidth: 3,
    borderColor: "rgba(249,115,22,0.25)",
  },

  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: "#101d38",
    borderWidth: 1,
    borderColor: "#1e2f52",
  },
  quoteRowOff: { opacity: 0.45 },
  quoteBox: { width: 13, height: 13, borderRadius: 3, backgroundColor: colors.green500 },
  quoteBoxOff: { backgroundColor: "#475569" },
  quoteName: { flex: 1, color: "#e2e8f0", fontSize: 12.5 },
  quoteNameOff: { color: "#64748b", textDecorationLine: "line-through" },
  quoteBar: { width: 42, height: 6, borderRadius: 3, backgroundColor: "#2c3f66" },

  walletCard: {
    width: "78%",
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: "#101d38",
    borderWidth: 1,
    borderColor: "#1e2f52",
  },
  walletLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  walletTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1e2f52",
    marginTop: 10,
    overflow: "hidden",
  },
  walletFill: { width: "38%", height: "100%", borderRadius: 4, backgroundColor: colors.blue600 },
  unlockRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  unlockDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.green500,
    alignItems: "center",
    justifyContent: "center",
  },
  unlockTick: { color: "#04210f", fontSize: 13, fontWeight: "900" },
  unlockText: { color: "#86efac", fontSize: 13, fontWeight: "700" },

  /* ---- Rail ---- */
  rail: { paddingHorizontal: spacing.lg, gap: 5, paddingVertical: spacing.sm },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    backgroundColor: "#111f3b",
  },
  railItemOn: { backgroundColor: colors.blue700 },
  railDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334768" },
  railDotDone: { backgroundColor: colors.green500 },
  railDotOn: { backgroundColor: "#fff" },
  railText: { color: "#8ea3c4", fontSize: 11.5, fontWeight: "700" },
  railTextOn: { color: "#fff" },

  voiceNote: {
    color: "#64748b",
    fontSize: 11,
    paddingHorizontal: spacing.lg,
    paddingBottom: 4,
  },

  /* ---- Footer ---- */
  foot: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  footRow: { flexDirection: "row", gap: spacing.sm },
  footBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16294f",
  },
  footBtnGrow: { flex: 1 },
  footBtnPrimary: { backgroundColor: colors.blue700 },
  footBtnOn: { backgroundColor: "#1e3a8a" },
  footBtnDisabled: { opacity: 0.4 },
  footBtnPressed: { opacity: 0.75 },
  footBtnText: { color: "#cbd5e1", fontSize: 13.5, fontWeight: "700" },
  footBtnTextPrimary: { color: "#fff" },
  footBtnTextOn: { color: "#fff" },
  footBtnTextDisabled: { color: "#64748b" },

  /* Off-screen, but still announced. */
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0, left: -9999 },
});
