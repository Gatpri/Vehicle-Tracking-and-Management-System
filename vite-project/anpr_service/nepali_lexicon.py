"""Nepali sentiment lexicon — Devanagari and Romanized, with negation.

Why this exists: the transformer handles Devanagari and English well but
returns a confident "neutral" for Romanized Nepali (see
benchmark_sentiment_models.py). Romanized is how people actually type reviews
on a phone, so the gap matters. A lexicon won't match a trained model, but it
catches the obvious cases the model misses entirely, and it is transparent —
you can point at the word that decided a score, which a transformer can't do.

Scores run -1.0 (strongly negative) to +1.0 (strongly positive). Romanized
spelling in Nepali is not standardised, so common variants are listed
explicitly rather than guessed at with fuzzy matching.
"""
import json
import os
import re
import unicodedata

# --- Negative ------------------------------------------------------------
# Slang first, since that is what a lexicon buys you over a dictionary.
NEGATIVE = {
    # slang / dismissive
    "bakwas": -0.9, "बकवास": -0.9, "bakbas": -0.9,
    "hawa": -0.7, "हावा": -0.7,            # "hawa kura" — empty talk, worthless
    "jhur": -0.8, "झुर": -0.8,             # lousy, poor quality
    "faltu": -0.8, "फालतु": -0.8,          # useless, pointless
    "bekar": -0.8, "बेकार": -0.8,
    "ghatiya": -0.9, "घटिया": -0.9,        # inferior, cheap-quality
    "nikamma": -0.8, "निकम्मा": -0.8,
    "raddi": -0.8, "रद्दी": -0.8,          # junk
    "jhyau": -0.6, "झ्याउ": -0.6,          # annoying
    "jhanjhat": -0.6, "झन्झट": -0.6,       # hassle
    # quality
    # Spelling variants matter more than they look: gen_reviews.py's drift
    # injection caught "naraamro" going unscored, which is exactly how a real
    # review would be missed.
    "naramro": -0.8, "नराम्रो": -0.8, "naraamro": -0.8, "naramo": -0.8,
    "kharab": -0.8, "खराब": -0.8,
    "birami": -0.4, "बिरामी": -0.4,
    "bigriyo": -0.7, "बिग्रियो": -0.7,     # broke down
    "bigreko": -0.7, "बिग्रेको": -0.7,
    "phutyo": -0.6, "फुट्यो": -0.6,        # broke
    "galti": -0.6, "गल्ती": -0.6,
    "samasya": -0.6, "समस्या": -0.6,
    "problem": -0.6,
    # honesty / money
    "thagi": -1.0, "ठगी": -1.0,            # fraud
    "thag": -1.0, "ठग": -1.0,
    "dhokha": -0.9, "धोका": -0.9,          # betrayal
    "chor": -0.9, "चोर": -0.9,             # thief
    "jhutho": -0.8, "झुटो": -0.8,          # liar / false
    "mahango": -0.5, "महँगो": -0.5, "mahengo": -0.5,
    "khera": -0.7, "खेर": -0.7,            # wasted ("paisa khera gayo")
    "luteko": -0.9, "लुटेको": -0.9,        # robbed / fleeced
    # service
    "dhilo": -0.6, "ढिलो": -0.6,           # slow / late
    "dhila": -0.6, "ढिला": -0.6,
    "fohor": -0.6, "फोहोर": -0.6,          # dirty
    "ruksha": -0.5,
    "risaune": -0.5,
    "dukha": -0.5, "दुःख": -0.5,
    # english that shows up mixed in
    "worst": -0.9, "terrible": -0.9, "useless": -0.8, "rubbish": -0.9,
    "bad": -0.7, "poor": -0.6, "slow": -0.5, "expensive": -0.5,
    "cheat": -0.9, "fraud": -1.0, "waste": -0.8, "disappointed": -0.8,
    "awful": -0.9, "pathetic": -0.9, "frustrated": -0.8, "annoyed": -0.7,
    "angry": -0.8, "rude": -0.8, "unprofessional": -0.8, "careless": -0.8,
    "scam": -1.0, "fake": -0.9, "duplicate": -0.7, "overpriced": -0.8,
    "delay": -0.6, "late": -0.5, "ignored": -0.8, "damage": -0.8,
    "worsened": -0.9, "adhuro": -0.7, "अधुरो": -0.7,
    "purano": -0.4, "पुरानो": -0.4,        # "old" — mild, context decides
}

# --- Positive ------------------------------------------------------------
POSITIVE = {
    # slang / enthusiastic
    "gajjab": 0.9, "गज्जब": 0.9,           # amazing
    "jabardast": 0.9, "जबरदस्त": 0.9,
    "mast": 0.8, "मस्त": 0.8,
    "badhiya": 0.9, "बढिया": 0.9,
    "lajawab": 0.9, "लाजवाब": 0.9,
    "majja": 0.7, "मज्जा": 0.7,            # fun / enjoyable
    # quality
    "ramro": 0.8, "राम्रो": 0.8, "raamro": 0.8, "ramaro": 0.8,
    "राम्ररी": 0.7, "ramrari": 0.7,
    "asal": 0.7, "असल": 0.7,               # good / decent
    "bhalo": 0.7, "भलो": 0.7,
    "safa": 0.6, "सफा": 0.6,               # clean
    "naya": 0.3, "नयाँ": 0.3,
    "sundar": 0.7, "सुन्दर": 0.7,
    "mitho": 0.7, "मीठो": 0.7,
    # trust / service
    "imandar": 0.9, "इमान्दार": 0.9,       # honest
    "bharpardo": 0.8, "भरपर्दो": 0.8,      # reliable
    "sahayogi": 0.7, "सहयोगी": 0.7,        # helpful
    "sahyog": 0.6, "सहयोग": 0.6,
    "bhorosa": 0.7, "भरोसा": 0.7,          # trust
    "chitto": 0.6, "छिटो": 0.6,            # fast
    "sasto": 0.6, "सस्तो": 0.6,            # cheap (good, for price)
    "sahi": 0.6, "सही": 0.6,               # correct
    # gratitude / satisfaction
    "dhanyabad": 0.7, "धन्यवाद": 0.7,
    "khusi": 0.8, "खुसी": 0.8,
    "santusta": 0.8, "सन्तुष्ट": 0.8,
    "sifaris": 0.7, "सिफारिस": 0.7,        # recommend
    # more Nepali slang
    "dami": 0.9, "दामी": 0.9,              # great, classy
    "babbal": 0.9, "बब्बाल": 0.9,          # awesome
    "sipalu": 0.8, "सिपालु": 0.8,          # skilled
    "bhorosilo": 0.8, "भरोसिलो": 0.8,      # dependable
    "prasanna": 0.7, "प्रसन्न": 0.7,

    # english mixed in
    "excellent": 0.9, "great": 0.8, "good": 0.7, "best": 0.9,
    "perfect": 0.9, "happy": 0.8, "nice": 0.6, "fast": 0.5,
    "honest": 0.8, "reliable": 0.8, "recommend": 0.7, "cheap": 0.5,
    "awesome": 0.9, "satisfied": 0.8, "friendly": 0.8, "helpful": 0.8,
    "professional": 0.8, "quick": 0.7, "durable": 0.7, "affordable": 0.7,
    "reasonable": 0.7, "smooth": 0.7, "genuine": 0.8, "quality": 0.5,
}

# --- Neutral -------------------------------------------------------------
# Listed so "thikai cha" (it's just okay) doesn't get read as praise via
# some other word in the sentence.
NEUTRAL = {
    "thik": 0.05, "ठीक": 0.05,
    "thikai": 0.0, "ठिकै": 0.0, "thikkai": 0.0,   # "just okay" — deliberately flat
    "samanya": 0.0, "सामान्य": 0.0,
    "okay": 0.05, "ok": 0.05, "average": 0.0, "normal": 0.0,
}

# Words that carry no opinion at all. Deliberately NOT in the lexicon: they are
# listed here so the review generator never slots them in where an adjective
# belongs. "yo workshop sakiyo cha" is not a review — sakiyo means "finished",
# and bhayo is a bare copula. Treating them as neutral sentiment words produced
# hundreds of meaningless sentences in the first generated corpus.
FILLER = {
    "sakiyo", "सकियो", "bhayo", "भयो", "bhaye", "भए", "garda", "gardai",
}

# --- Phrases -------------------------------------------------------------
# Matched before single words, longest first, and the words they consume are
# not scored again.
#
# This exists because Nepali carries much of its sentiment in two-word units
# whose parts are neutral or even misleading alone: "man paryo" (liked it) is
# built from "man" (heart) and "paryo" (fell), and "chitta bujhena" (not
# satisfied) would otherwise be scored only by its negator. Word-by-word
# matching cannot reach these.
PHRASES = {
    # --- negative
    "man parena": -0.8,          # didn't like it
    "मन परेन": -0.8,
    "ramro lagena": -0.8,        # didn't seem good
    "राम्रो लागेन": -0.8,
    "chitta bujhena": -0.8,      # not satisfied
    "चित्त बुझेन": -0.8,
    "satisfied chaina": -0.8,
    "kaam adhuro": -0.8,         # work left unfinished
    "काम अधुरो": -0.8,
    "thik garena": -0.8,         # didn't fix it
    "ठीक गरेन": -0.8,
    "ramro bhayena": -0.8,
    "राम्रो भएन": -0.8,
    "paisa khera": -0.9,         # money wasted
    "पैसा खेर": -0.9,
    "waste of money": -0.9,
    "hidden charge": -0.9,
    "extra charge": -0.7,
    "no response": -0.8,
    "same issue": -0.8,
    "duplicate parts": -0.9,
    "fake parts": -1.0,
    "used parts": -0.7,
    "purano parts": -0.7,
    "low quality": -0.8,
    "not recommended": -0.9,
    "recommend gardina": -0.9,   # I won't recommend
    "never again": -0.9,
    "use nagarnu": -0.9,         # don't use it
    "avoid garnu": -0.9,         # avoid it
    "engine bigriyo": -0.9,
    "इन्जिन बिग्रियो": -0.9,
    "damage bhayo": -0.8,
    "डयामेज भयो": -0.8,

    # --- positive
    "man paryo": 0.9,            # liked it
    "मन पर्‍यो": 0.9,
    "ramro lagyo": 0.9,
    "राम्रो लाग्यो": 0.9,
    "chitta bujhyo": 0.8,        # satisfied
    "चित्त बुझ्यो": 0.8,
    "problem solve bhayo": 0.9,
    "thik bhayo": 0.7,
    "ठीक भयो": 0.7,
    "ramro bhayo": 0.8,
    "राम्रो भयो": 0.8,
    "smooth cha": 0.8,
    "value for money": 0.9,
    "worth it": 0.9,
    "top quality": 0.9,
    "highly recommend": 1.0,
    "on time": 0.7,
    "feri aauchu": 0.9,          # I'll come again
    "फेरि आउँछु": 0.9,
    "original parts": 0.8,

    # --- neutral, and deliberately so
    "thikai cha": 0.0,           # "it's just okay" — not praise
    "ठिकै छ": 0.0,
    "thik jasto": 0.0,
    "ali thik": 0.1,
    "so so": 0.0,
    "just okay": 0.0,
    "kaam bhayo": 0.0,           # states completion, no opinion
    "काम भयो": 0.0,
    "kaam sakiyo": 0.0,
    "service bhayo": 0.0,
    "oil change": 0.0,
    "engine check": 0.0,
    # "not bad" is mild approval, and negation must not flip it
    "not bad": 0.3,
    "naramro chaina": 0.3,
}

LEXICON = {**NEGATIVE, **POSITIVE, **NEUTRAL}


def _load_custom_words():
    """Words added in custom_words.json, merged over the built-ins.

    Kept out of this file on purpose: adding slang shouldn't mean editing
    Python, where one stray comma stops the service booting. The JSON is
    optional — if it's missing or malformed the built-in lexicon still works,
    and the problem is reported rather than swallowed.

    Format — word to score, -1.0 (worst) .. +1.0 (best):
        {
          "lattu":   -0.8,
          "jhilke":  -0.6,
          "छ्या":    -0.7
        }
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "custom_words.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"custom_words.json ignored — {exc}")
        return {}

    cleaned = {}
    for word, value in data.items():
        # JSON has no comments, so keys starting with "_" are treated as notes.
        if word.startswith("_"):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            print(f"custom_words.json: '{word}' has a non-numeric score, skipped")
            continue
        if not -1.0 <= number <= 1.0:
            print(f"custom_words.json: '{word}' score {number} is outside -1..1, skipped")
            continue
        cleaned[unicodedata.normalize("NFC", str(word).lower())] = number
    return cleaned


CUSTOM_WORDS = _load_custom_words()
LEXICON.update(CUSTOM_WORDS)

# Flip the polarity of the word that follows. Without this "ramro chaina"
# (not good) scores positive, which is the single most damaging error a
# review lexicon can make.
NEGATORS = {
    "chaina", "छैन", "thiena", "थिएन", "hoina", "होइन", "haina", "हैन",
    "bhaena", "भएन", "na", "न", "nai", "no", "not", "never",
    "paena", "पाइएन", "garena", "गरेन",
}

# Multiply the next word's score. "ekdam ramro" is stronger than "ramro".
INTENSIFIERS = {
    "ekdam": 1.5, "एकदम": 1.5,
    "dherai": 1.4, "धेरै": 1.4,
    "atti": 1.4, "अत्ति": 1.4,
    "very": 1.4, "really": 1.3, "too": 1.3, "so": 1.2,
    "ekdamai": 1.6, "एकदमै": 1.6,
}

# Reduce the strength of the next sentiment word. Useful for phrases like
# "little bit good" or "thorai negative".
DAMPENERS = {
    "ali": 0.5, "अलि": 0.5,
    "thorai": 0.5, "थोरै": 0.5, "thora": 0.5, "थोरा": 0.5,
    "thoda": 0.5, "थोडा": 0.5, "thodi": 0.5, "थोडी": 0.5,
    "little": 0.5, "bit": 0.5, "slightly": 0.5, "somewhat": 0.5,
    "mildly": 0.5, "barely": 0.5, "khoi": 0.5, "खोई": 0.5,
}

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def detect_script(text):
    """Which of the three forms this is — drives model routing upstream."""
    if DEVANAGARI.search(text):
        return "devanagari"
    # Romanized Nepali vs English: presence of any Nepali-only token decides
    # it. Imperfect for one-word reviews, fine for real sentences.
    words = set(_tokenise(text))
    # Phrase words count too: "man paryo" and "chitta bujhena" are Romanized
    # Nepali, but neither word appears in the single-word lexicon, so without
    # this they'd be misread as English and routed to the transformer — which
    # has no idea what they mean.
    phrase_words = {w for phrase in PHRASES for w in phrase.split() if w.isascii()}
    nepali_markers = (
        {w for w in LEXICON if w.isascii()} | phrase_words | NEGATORS | set(INTENSIFIERS) | set(DAMPENERS)
    )
    nepali_markers -= {
        "no", "not", "never", "very", "really", "too", "so", "ok", "okay",
        "good", "bad", "best", "great", "nice", "fast", "cheap", "poor",
        "slow", "worst", "problem", "average", "normal", "honest", "happy",
        "perfect", "reliable", "recommend", "excellent", "terrible",
        "useless", "rubbish", "waste", "cheat", "fraud", "expensive",
        "disappointed", "awful", "pathetic", "frustrated", "annoyed",
        "angry", "rude", "unprofessional", "careless", "scam", "fake",
        "duplicate", "overpriced", "delay", "late", "ignored", "damage",
        "worsened", "awesome", "satisfied", "friendly", "helpful",
        "professional", "quick", "durable", "affordable", "reasonable",
        "smooth", "genuine", "quality", "value", "for", "money", "worth",
        "it", "top", "on", "time", "highly", "parts", "original", "used",
        "low", "no", "response", "same", "issue", "never", "again",
        "avoid", "just", "so", "check", "change", "oil", "engine",
        "service", "solve", "problem", "recommended",
    }
    return "romanized" if words & nepali_markers else "english"


def _tokenise(text):
    normalised = unicodedata.normalize("NFC", text.lower())
    return re.findall(r"[\wऀ-ॿ]+", normalised)


def score(text):
    """Sentiment from the lexicon alone.

    Returns (score, label, matches) where matches lists the words that decided
    it — the reason to keep a lexicon around even once a model exists, since
    it can always explain itself.
    """
    tokens = _tokenise(text)
    total = 0.0
    hits = 0
    matches = []

    # Phrases first, longest first, so "naramro chaina" (not bad — mild
    # approval) is taken whole rather than as "naramro" flipped by a negator,
    # and "thikai cha" can't be pulled positive by a neighbouring word.
    consumed = set()
    for length in (3, 2):
        for i in range(len(tokens) - length + 1):
            if any(j in consumed for j in range(i, i + length)):
                continue
            candidate = " ".join(tokens[i:i + length])
            if candidate not in PHRASES:
                continue
            value = PHRASES[candidate]
            # Intensifier immediately before the phrase still applies.
            multiplier = INTENSIFIERS.get(tokens[i - 1], 1.0) if i > 0 else 1.0
            final = value * multiplier
            total += final
            hits += 1
            consumed.update(range(i, i + length))
            matches.append({"word": candidate, "score": round(final, 2), "negated": False})

    for i, token in enumerate(tokens):
        if i in consumed or token not in LEXICON:
            continue
        value = LEXICON[token]

        # Look back two words for a negator or intensifier: Nepali puts them
        # before ("ekdam ramro") and after ("ramro chaina") the adjective.
        window = [
            t for j, t in enumerate(tokens)
            if j != i and j not in consumed and (max(0, i - 2) <= j < i or i < j < i + 3)
        ]
        multiplier = 1.0
        negated = False
        for neighbour in window:
            if neighbour in NEGATORS:
                negated = True
            elif neighbour in INTENSIFIERS:
                multiplier *= INTENSIFIERS[neighbour]
            elif neighbour in DAMPENERS:
                multiplier *= DAMPENERS[neighbour]

        final = value * multiplier * (-1 if negated else 1)
        total += final
        hits += 1
        matches.append({"word": token, "score": round(final, 2), "negated": negated})

    if hits == 0:
        return 0.0, "neutral", []

    # Mean rather than sum, so a long review isn't automatically extreme.
    mean = max(-1.0, min(1.0, total / hits))
    if mean >= 0.25:
        label = "positive"
    elif mean <= -0.25:
        label = "negative"
    else:
        label = "neutral"
    return round(mean, 3), label, matches


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")

    # Pass a phrase to test just that one:
    #   python nepali_lexicon.py "service bakwas thiyo"
    if len(sys.argv) > 1:
        phrase = " ".join(sys.argv[1:])
        value, label, matched = score(phrase)
        print(f"\n  {phrase}")
        print(f"  -> {label}  ({value:+.2f})  script={detect_script(phrase)}")
        if matched:
            for m in matched:
                flag = " [negated]" if m["negated"] else ""
                print(f"     {m['word']}: {m['score']:+.2f}{flag}")
        else:
            print("     no known words matched — add them to custom_words.json")
        sys.exit(0)

    if CUSTOM_WORDS:
        print(f"  ({len(CUSTOM_WORDS)} extra word(s) loaded from custom_words.json)\n")

    samples = [
        "sewa ramro thiyo",
        "kaam ekdam ramro cha, dhanyabad",
        "bakwas service, paisa khera gayo",
        "hawa kaam, jhur workshop",
        "ekdam bakwas ho, thagi garyo",
        "ramro chaina",                      # negation
        "naramro chaina",                    # phrase: mild approval
        "thikai cha",                        # phrase: deliberately flat
        "yo workshop man paryo",             # phrase, parts neutral alone
        "mechanic ko kaam man parena",
        "chitta bujhena, same issue ayo",
        "duplicate parts halyo, paisa khera",
        "highly recommend, value for money",
        "engine bigriyo pachi thik garena",
        "gajjab! mast kaam bhayo",
        "dhilo ra mahango, faltu",
        "सेवा एकदम राम्रो थियो",
        "धेरै नराम्रो सेवा, पैसा खेर गयो",
        "excellent service, very happy",
    ]
    for s in samples:
        value, label, matched = score(s)
        words = ", ".join(f"{m['word']}{'(neg)' if m['negated'] else ''}" for m in matched) or "-"
        print(f"  {label:8} {value:+.2f}  [{detect_script(s):10}]  {s}")
        print(f"           matched: {words}")
