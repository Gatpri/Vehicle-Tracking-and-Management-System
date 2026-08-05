"""Generate labelled workshop-review sentences, then grade the lexicon on them.

Two jobs in one script:

  1. Build a labelled corpus (reviews.csv) — usable as training data, or as a
     regression suite for the lexicon.
  2. Score the lexicon against it and print exactly which patterns it gets
     wrong, so the gaps are a list of things to fix rather than a vague sense
     that "it mostly works".

A warning that comes from this project's own history. gen_embossed.py v1
synthesised plates that scored 0.995 on their own synthetic test and failed on
real photographs, because the synthetic data didn't look like reality. Template
text has the identical trap: if every sentence is "{subject} {word} cha" and the
label is decided by one keyword, a model trained on it learns the keyword list —
which the lexicon already does, for free, and can explain.

So the templates here deliberately include the things a keyword lookup cannot
survive:
  - negation      "X ramro chaina"        positive word, negative label
  - mixed clauses "price ramro tara dhilo" two polarities, one label
  - flat reports  "kaam sakiyo"            no opinion at all
  - spelling drift, since romanized Nepali has no standard

Evaluate on real reviews. Synthetic accuracy is not a result.

    python gen_reviews.py --count 3000 --out reviews.csv
"""
import argparse
import csv
import random
import sys
from collections import Counter

from nepali_lexicon import NEGATIVE, POSITIVE, NEUTRAL, PHRASES, score

SUBJECTS = [
    "yo workshop", "yo garage", "yo servicing center", "yo auto workshop",
    "yo mechanic shop", "yo mechanic", "yo mechanic dai", "yo technician",
    "staff haru", "worker haru", "yo servicing", "yo repair service",
    "engine repair", "bike servicing", "car servicing", "maintenance service",
    "service time", "waiting time", "repair time", "delivery time",
    "yo price", "service cost", "repair cost", "bill amount", "yo charge",
    "mero bike condition", "mero car condition", "engine condition",
    "vehicle performance", "brake condition", "engine kaam", "brake system",
    "parts replacement", "battery service", "tyre condition",
    "yo spare parts", "parts quality", "replacement parts",
    "customer service", "phone response", "support team", "complaint handling",
    "yo bill", "billing system", "payment system",
    "overall experience", "mero experience", "yo thau", "yo place",
]

# Single-word entries only. Phrases carry their own grammar and are slotted in
# separately, otherwise "{subject} man paryo cha" comes out malformed.
POS_WORDS = [w for w, v in POSITIVE.items() if v >= 0.5 and w.isascii()]
NEG_WORDS = [w for w, v in NEGATIVE.items() if v <= -0.5 and w.isascii()]
NEU_WORDS = [w for w in NEUTRAL if w.isascii()]

POS_PHRASES = [p for p, v in PHRASES.items() if v >= 0.5 and p.isascii()]
NEG_PHRASES = [p for p, v in PHRASES.items() if v <= -0.5 and p.isascii()]
NEU_PHRASES = [p for p, v in PHRASES.items() if -0.25 < v < 0.25 and p.isascii()]

# Straightforward: the sentiment word decides the label.
#
# "ma {s} bata {w} bhaye" was removed — it has no verb and needs the dative
# "malai", so it produced ungrammatical Nepali. "{s} le malai {w} banayo"
# ("made me {w}") was removed too: it works for a feeling but is incoherent for
# a price or quality adjective, giving "the bill made me cheap".
PLAIN = [
    "{s} {w} cha",
    "{s} ekdam {w} cha",
    "{s} lastai {w} cha",
    "{s} use garda {w} feel bhayo",
    "{s} ko quality {w} cha",
    "{s} dherai {w} lagyo",
    "{s} ma {w} experience bhayo",
    "malai {s} {w} lagyo",
]

# The label FLIPS: a positive word negated is a complaint. Without these a
# model never learns that "chaina" matters.
NEGATED = [
    "{s} {w} chaina",
    "{s} {w} thiena",
    "{s} {w} bhaena",
    "{s} pura {w} chaina",
    "malai {s} {w} lagena",
]

# Two polarities in one sentence. The connective decides the label, and this
# distinction is the single most important thing these templates teach:
#
#   "tara" (but)  - concessive. The second clause is the verdict, so the label
#                   follows it: "mahango thiyo tara ramro bhayo" is positive.
#   "pani" (also) - additive. BOTH clauses are asserted equally, so there is no
#                   verdict and the honest label is neutral.
#
# The first corpus labelled every mixed sentence by its second clause, which
# made "sasto cha, hawa pani cha" positive — plainly wrong.
MIXED_CONCESSIVE = [
    "{s} {w1} cha tara {w2} cha",
    "{s} {w1} thiyo tara {w2} bhayo",
]
MIXED_ADDITIVE = [
    "{s} ma {w1} cha, {w2} pani cha",
    "{s} {w1} pani cha, {w2} pani cha",
]

# Phrases already contain their verb, so they take a lighter frame.
PHRASE_FRAMES = [
    "{s} {p}",
    "{s} ma {p}",
    "ma {s} bata {p}",
    "{s} ko barema {p}",
]

# Romanized Nepali has no standard spelling. Teaching only one form makes the
# model brittle against the way people actually type.
VARIANTS = {
    "ramro": ["ramro", "raamro", "ramro"],
    "naramro": ["naramro", "na ramro", "naraamro"],
    "cha": ["cha", "chha", "cha"],
    "bakwas": ["bakwas", "bakbas"],
    "mahango": ["mahango", "mahengo"],
    "dhilo": ["dhilo", "dhila"],
    "thikai": ["thikai", "thikkai"],
}


def drift(sentence, rate):
    """Apply occasional spelling variation and casing noise."""
    words = sentence.split()
    out = []
    for word in words:
        if word in VARIANTS and random.random() < rate:
            word = random.choice(VARIANTS[word])
        out.append(word)
    text = " ".join(out)
    roll = random.random()
    if roll < rate * 0.3:
        text = text.upper()
    elif roll < rate * 0.5:
        text = text.capitalize()
    return text


def make(label, drift_rate):
    subject = random.choice(SUBJECTS)
    words = {"positive": POS_WORDS, "negative": NEG_WORDS, "neutral": NEU_WORDS}[label]
    phrases = {"positive": POS_PHRASES, "negative": NEG_PHRASES, "neutral": NEU_PHRASES}[label]

    roll = random.random()

    # Phrase-framed
    if phrases and roll < 0.25:
        text = random.choice(PHRASE_FRAMES).format(s=subject, p=random.choice(phrases))

    # Negated: draw from the OPPOSITE pool, since negating it produces this label
    elif label != "neutral" and roll < 0.45:
        opposite = POS_WORDS if label == "negative" else NEG_WORDS
        text = random.choice(NEGATED).format(s=subject, w=random.choice(opposite))

    # Concessive mixed ("tara"): verdict is the second clause, so this label.
    elif label != "neutral" and roll < 0.60:
        other = NEG_WORDS if label == "positive" else POS_WORDS
        text = random.choice(MIXED_CONCESSIVE).format(
            s=subject, w1=random.choice(other), w2=random.choice(words)
        )

    # Additive mixed ("pani"): both asserted, so it can only ever be neutral —
    # generated under the neutral label, never under positive or negative.
    elif label == "neutral" and roll < 0.45:
        text = random.choice(MIXED_ADDITIVE).format(
            s=subject, w1=random.choice(POS_WORDS), w2=random.choice(NEG_WORDS)
        )

    else:
        text = random.choice(PLAIN).format(s=subject, w=random.choice(words))

    return drift(text, drift_rate)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=3000, help="per label")
    parser.add_argument("--out", default="reviews.csv")
    parser.add_argument("--drift", type=float, default=0.25, help="spelling noise 0-1")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    rows = []
    seen = set()
    for label in ("positive", "negative", "neutral"):
        made = 0
        attempts = 0
        # Deduplicated: repeated identical sentences inflate the corpus without
        # adding information, and quietly bias whatever trains on it.
        while made < args.count and attempts < args.count * 40:
            attempts += 1
            text = make(label, args.drift)
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            rows.append({"sentence": text, "label": label})
            made += 1
        if made < args.count:
            print(f"  note: only {made} unique {label} sentences were possible "
                  f"({args.count} asked for) — add subjects or words for more variety")

    random.shuffle(rows)
    with open(args.out, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["sentence", "label"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} sentences to {args.out}")
    print("  " + ", ".join(f"{k}={v}" for k, v in Counter(r["label"] for r in rows).items()))

    # --- grade the lexicon on its own generated data ---------------------
    print("\n=== lexicon vs the generated labels ===")
    confusion = Counter()
    wrong = []
    for row in rows:
        _value, predicted, _matched = score(row["sentence"])
        confusion[(row["label"], predicted)] += 1
        if predicted != row["label"]:
            wrong.append((row["label"], predicted, row["sentence"]))

    for actual in ("positive", "negative", "neutral"):
        total = sum(v for (a, _p), v in confusion.items() if a == actual)
        right = confusion[(actual, actual)]
        if total:
            print(f"  {actual:9}: {right}/{total} = {right / total:.1%}")
    overall = sum(confusion[(l, l)] for l in ("positive", "negative", "neutral"))
    print(f"  OVERALL  : {overall}/{len(rows)} = {overall / len(rows):.1%}")

    if wrong:
        print(f"\n  {len(wrong)} disagreements — the first few, as things to fix:")
        for actual, predicted, text in wrong[:12]:
            print(f"    want {actual:8} got {predicted:8}  {text}")
        print("\n  Each one is either a missing lexicon entry or a template that")
        print("  produces text a human wouldn't label that way. Both are worth knowing.")

    print("\n  Reminder: this measures the lexicon against templates built from")
    print("  the same lexicon, so it is a consistency check, not an accuracy")
    print("  figure. Only real reviews can give you that.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
