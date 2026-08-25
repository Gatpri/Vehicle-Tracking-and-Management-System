import * as Speech from "expo-speech";

/**
 * Bilingual narration, the mobile counterpart of the web app's src/lib/speak.ts.
 *
 * Same contract as the web helper — speak() resolves when the voice stops, so
 * a walkthrough can use the speech itself as its clock rather than guessing a
 * duration — but built on expo-speech instead of the Web Speech API.
 *
 * The device differences the web version works around apply here too, and one
 * more besides. On Android a Nepali (or Hindi) voice is usually present through
 * Google's speech services; on iOS ne-NP generally is not, and Devanagari read
 * by an English voice produces nothing usable. So the same fallback applies:
 * when no Devanagari-capable voice exists, the romanized line is spoken through
 * an English voice instead of falling silent.
 */

export type Lang = "en" | "ne";

/** BCP-47 tags, most specific first — Nepali may be installed as ne-NP or ne. */
const LANG_TAGS: Record<Lang, string[]> = {
  en: ["en-US", "en-GB", "en-IN", "en"],
  ne: ["ne-NP", "ne", "hi-IN", "hi"],
};

/**
 * The voice list, fetched once and cached.
 *
 * getAvailableVoicesAsync is a bridge call that can take a moment on Android
 * and throws on a device with no TTS engine at all, so it is asked for once and
 * a failure is treated as "no voices" rather than propagated — narration is an
 * enhancement, and its absence must not break the screen using it.
 */
let voicesPromise: Promise<Speech.Voice[]> | null = null;

export const loadVoices = (): Promise<Speech.Voice[]> => {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync().catch(() => []);
  }
  return voicesPromise;
};

/**
 * Best available language tag for a language, or null when the device has
 * nothing that can read it.
 *
 * Nepali (ne-NP) is missing on most iPhones. The tag list above falls back to
 * Hindi, which shares Devanagari and pronounces Nepali text far more
 * intelligibly than an English voice would.
 */
export const pickLanguage = (voices: Speech.Voice[], lang: Lang): string | null => {
  for (const tag of LANG_TAGS[lang]) {
    const hit = voices.find((v) => {
      const l = (v.language || "").toLowerCase().replace("_", "-");
      return l === tag.toLowerCase() || l.startsWith(tag.toLowerCase() + "-");
    });
    if (hit) return hit.language;
  }
  return null;
};

/** True when the device can read Devanagari at all. */
export const hasNepaliVoice = (voices: Speech.Voice[]): boolean =>
  pickLanguage(voices, "ne") !== null;

/** Stops anything currently being spoken. Safe to call when nothing is. */
export const cancelSpeech = (): void => {
  void Speech.stop();
};

/**
 * Speaks one phrase, resolving when it finishes.
 *
 * Never rejects, and always resolves exactly once: onDone, onStopped and
 * onError all land on the same guarded finish, because a promise that never
 * settles would stall a walkthrough that advances on it.
 */
export const speak = (
  text: string,
  lang: Lang,
  voices: Speech.Voice[],
  {
    rate = 0.95,
    /**
     * The same Nepali sentence in Latin letters. Spoken — never shown — when
     * the device has no Devanagari voice: reading "tapaile aafno gaadiko
     * number plate raakhnuhunchha" through an English voice is accented but
     * understandable, which is the whole point for a listener who needs it.
     */
    romanized,
    /**
     * Silence held after the voice stops before this resolves. The caller
     * advances on the resolution, so a small tail keeps scenes from snapping
     * over the end of a sentence.
     */
    tailMs = 0,
  }: { rate?: number; romanized?: string; tailMs?: number } = {}
): Promise<void> =>
  new Promise((resolve) => {
    if (!text.trim()) return resolve();

    const available = pickLanguage(voices, lang);

    // Nepali with nothing that reads Devanagari: speak the romanized line
    // rather than staying silent, which would drop half the narration for
    // exactly the users it exists for.
    let spokenText = text;
    let spokenLang = available;
    const romanizing = lang === "ne" && !available;
    if (romanizing) {
      if (!romanized?.trim()) return resolve();
      spokenText = romanized;
      spokenLang = pickLanguage(voices, "en") ?? "en-US";
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (tailMs > 0) setTimeout(resolve, tailMs);
      else resolve();
    };

    Speech.speak(spokenText, {
      language: spokenLang ?? LANG_TAGS[lang][0],
      // Romanized Nepali read by an English voice is clearer a little slower.
      rate: romanizing ? Math.min(rate, 0.85) : rate,
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
  });
