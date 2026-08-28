/**
 * Bilingual narration built on the browser's own speech synthesis.
 *
 * Used by the "See How It Works" walkthrough so a blind or low-vision visitor
 * hears the explanation rather than only seeing it, in English and Nepali.
 *
 * Why the Web Speech API rather than recorded audio files: no megabytes to
 * download, nothing to re-record when the wording changes, and the visitor's
 * own preferred voice and speaking rate are respected. The trade is that voice
 * availability differs per device — see pickVoice below.
 */

export type Lang = "en" | "ne";

/** BCP-47 tags, most specific first — Nepali may be installed as ne-NP or ne. */
const LANG_TAGS: Record<Lang, string[]> = {
  en: ["en-US", "en-GB", "en-IN", "en"],
  ne: ["ne-NP", "ne", "hi-IN", "hi"],
};

export const speechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Voices load asynchronously in Chrome: getVoices() is empty on first call and
 * fills in later, which is why this resolves on the voiceschanged event rather
 * than reading once. Resolves with whatever is available after a short wait, so
 * a browser that never fires the event does not hang the caller forever.
 */
export const loadVoices = (): Promise<SpeechSynthesisVoice[]> =>
  new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 1200);
  });

/**
 * Best available voice for a language.
 *
 * Nepali (ne-NP) is not installed on most desktops. Rather than fall silent,
 * the tag list above falls back to Hindi, which shares Devanagari script and
 * pronounces Nepali text far more intelligibly than an English voice would.
 * Returns null when nothing matches, and the caller then skips that language
 * instead of reading Nepali words in an American accent.
 */
/**
 * Marks of a modern neural voice, which sounds close to a real person, versus
 * the decade-old formant voices Windows still ships (Hazel, Zira, George).
 * Edge exposes "Microsoft Ravi Online (Natural)"; Chrome on Android exposes
 * Google voices. Both are enormously better than the local fallbacks, so they
 * are preferred whenever present.
 */
const NATURAL_HINTS = ["natural", "neural", "online", "google", "premium", "enhanced", "siri"];

const naturalness = (v: SpeechSynthesisVoice): number => {
  const name = v.name.toLowerCase();
  const hit = NATURAL_HINTS.some((h) => name.includes(h));
  // A non-local voice is a cloud voice, which in practice means a neural one.
  return (hit ? 2 : 0) + (v.localService ? 0 : 1);
};

export const pickVoice = (
  voices: SpeechSynthesisVoice[],
  lang: Lang
): SpeechSynthesisVoice | null => {
  for (const tag of LANG_TAGS[lang]) {
    const matches = voices.filter((v) => {
      const l = v.lang.toLowerCase().replace("_", "-");
      return l === tag.toLowerCase() || l.startsWith(tag.toLowerCase() + "-");
    });
    if (matches.length) {
      // Best-sounding match for this tag, rather than whichever the browser
      // happened to list first — that is usually the oldest one installed.
      return [...matches].sort((a, b) => naturalness(b) - naturalness(a))[0];
    }
  }
  return null;
};

/** Stops anything currently being spoken. Safe to call when nothing is. */
export const cancelSpeech = (): void => {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
};

/**
 * Speaks one phrase, resolving when it finishes (or immediately if speech is
 * unavailable). Never rejects: narration is an enhancement, and a failure to
 * speak must not break the thing it is narrating.
 */
export const speak = (
  text: string,
  lang: Lang,
  voices: SpeechSynthesisVoice[],
  {
    rate = 0.95,
    /**
     * The same Nepali sentence written in Latin letters. Used only when the
     * device has no Devanagari-capable voice: an English voice reading
     * Devanagari produces nothing usable, but reading "tapaile aafno gaadiko
     * number plate raakhnuhunchha" produces recognisable Nepali. Accented, but
     * understandable — which is the whole point for a listener who needs it.
     */
    romanized,
    /**
     * Silence held after the voice stops before this resolves. The caller uses
     * the resolution to advance the walkthrough, so a small tail keeps scenes
     * from snapping over the end of a sentence.
     */
    tailMs = 0,
  }: { rate?: number; romanized?: string; tailMs?: number } = {}
): Promise<void> =>
  new Promise((resolve) => {
    if (!speechSupported() || !text.trim()) return resolve();

    const voice = pickVoice(voices, lang);

    // Nepali with no Nepali/Hindi voice available: speak the romanized line
    // through whatever voice exists rather than staying silent. Falling silent
    // would drop half the narration for exactly the users it is there for.
    let spokenText = text;
    let spokenVoice = voice;
    if (lang === "ne" && !voice) {
      if (!romanized?.trim()) return resolve();
      spokenText = romanized;
      spokenVoice = pickVoice(voices, "en");
    }

    const utterance = new SpeechSynthesisUtterance(spokenText);
    if (spokenVoice) utterance.voice = spokenVoice;
    utterance.lang = spokenVoice?.lang ?? LANG_TAGS[lang][0];
    // Romanized Nepali read by an English voice is clearer a little slower.
    utterance.rate = lang === "ne" && !voice ? Math.min(rate, 0.85) : rate;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(watchdog);
      if (tailMs > 0) window.setTimeout(resolve, tailMs);
      else resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;

    // Chrome drops `end` (and sometimes `error`) when synthesis stalls — a
    // backgrounded tab, a voice swapped out mid-sentence, an over-long
    // utterance. The callers use this promise as the clock that advances the
    // walkthrough, so a dropped event does not merely lose the audio: it
    // freezes the whole thing on one step with no way forward.
    //
    // The budget is derived from the text and deliberately generous, because
    // firing early is worse than firing late: a false trigger would cut a
    // scene short, while a late one only delays recovery from a stall nobody
    // can fix anyway.
    //
    // Real speech runs ~13 characters/second at rate 1. 150ms/char is roughly
    // double that, so even an unusually slow voice finishes first. The longest
    // line in the walkthroughs is ~320 chars, and the spoken form (step lead +
    // body) reaches ~480 — about 44s of audio, against a ~74s budget here.
    // The ceiling is set above that worst case rather than below it, which an
    // earlier 60s cap was not.
    const budgetMs = Math.min(
      120_000,
      Math.max(5_000, (spokenText.length * 150) / Math.max(utterance.rate, 0.1)) + 3_000
    );
    const watchdog = window.setTimeout(() => {
      // Leaving a stalled utterance queued would block everything spoken
      // after it, so clear the queue before handing control back.
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Nothing useful to do — resolving anyway is the point.
      }
      finish();
    }, budgetMs);

    window.speechSynthesis.speak(utterance);
  });

/**
 * Unlocks speech synthesis from inside a user gesture.
 *
 * Chrome (and Safari) treat speech like audio: the first speak() must be able
 * to trace back to a real interaction, or it is silently dropped — no error,
 * no event, just silence for the rest of the page's life. A walkthrough that
 * begins narrating a moment AFTER the click that opened it can miss that
 * window, especially now that the first utterance waits for the voice list.
 *
 * Speaking a single space inside the click itself satisfies the policy and is
 * inaudible. Safe to call repeatedly; after the first success it is a no-op in
 * effect.
 */
export const primeSpeech = (): void => {
  if (!speechSupported()) return;
  try {
    // Clear anything stuck from a previous page interaction first.
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    // An unusable synthesiser is not worth breaking the click over.
  }
};

/** True when a Nepali (or Devanagari-capable) voice exists on this device. */
export const hasNepaliVoice = (voices: SpeechSynthesisVoice[]): boolean =>
  pickVoice(voices, "ne") !== null;
