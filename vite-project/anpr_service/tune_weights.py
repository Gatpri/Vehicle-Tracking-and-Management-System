"""Suggest lexicon weights from a hand-corrected labelled corpus.

For every lexicon entry, look at the labels of the sentences it appears in and
work out what weight would be consistent with them. Prints the disagreements
and, with --write, saves the suggestions to custom_words.json.

    python tune_weights.py sentiment_corrected.csv
    python tune_weights.py sentiment_corrected.csv --write

Read the output before trusting it. Two honest limits:

  1. If the corpus was generated FROM this lexicon, the agreement is largely
     circular — it mostly measures self-consistency. The signal lives in the
     rows a human corrected, which is why --min-count exists: a word seen
     three times tells you nothing.

  2. A word in a mixed sentence gets credited with a label it didn't cause.
     "sasto cha, hawa pani cha" is neutral, but "sasto" isn't neutral — it just
     appeared next to something negative. Sentences containing an opposing
     word are therefore skipped rather than counted.
"""
import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict

from nepali_lexicon import LEXICON, PHRASES, _tokenise

LABEL_VALUE = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}


def load(path):
    with open(path, encoding="utf-8") as handle:
        return [
            (row["sentence"], row["label"].strip().lower())
            for row in csv.DictReader(handle)
            if row.get("sentence") and row.get("label")
        ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--min-count", type=int, default=8,
                        help="ignore entries seen fewer times than this")
    parser.add_argument("--tolerance", type=float, default=0.35,
                        help="only report entries differing by more than this")
    parser.add_argument("--write", action="store_true",
                        help="save suggestions into custom_words.json")
    args = parser.parse_args()

    rows = load(args.csv_path)
    print(f"Loaded {len(rows)} labelled sentences from {args.csv_path}")
    print("  " + ", ".join(f"{k}={v}" for k, v in Counter(l for _s, l in rows).items()))

    # A term's observed polarity, counted only where it isn't competing with an
    # opposite-signed word in the same sentence.
    observations = defaultdict(list)
    skipped_mixed = 0

    for sentence, label in rows:
        if label not in LABEL_VALUE:
            continue
        lowered = sentence.lower()
        tokens = set(_tokenise(sentence))

        present = {t for t in tokens if t in LEXICON}
        present |= {p for p in PHRASES if p in lowered}
        if not present:
            continue

        signs = {1 if (LEXICON.get(t) or PHRASES.get(t, 0)) > 0.15
                 else -1 if (LEXICON.get(t) or PHRASES.get(t, 0)) < -0.15
                 else 0
                 for t in present}
        if 1 in signs and -1 in signs:
            skipped_mixed += 1
            continue

        for term in present:
            observations[term].append(LABEL_VALUE[label])

    print(f"  skipped {skipped_mixed} mixed-polarity sentences (they'd credit "
          f"a word with a label it didn't cause)")

    suggestions = {}
    rows_out = []
    for term, values in observations.items():
        if len(values) < args.min_count:
            continue
        current = LEXICON.get(term, PHRASES.get(term))
        if current is None:
            continue
        observed = sum(values) / len(values)
        # Damped: move most of the way toward the evidence, not all of it, so a
        # single skewed sample can't slam a weight to an extreme.
        suggested = round(max(-1.0, min(1.0, current * 0.3 + observed * 0.7)), 2)
        if abs(suggested - current) > args.tolerance:
            rows_out.append((term, current, suggested, observed, len(values)))
            suggestions[term] = suggested

    rows_out.sort(key=lambda r: -abs(r[2] - r[1]))
    print(f"\n=== {len(rows_out)} entries disagree with the corpus by more than "
          f"{args.tolerance} (seen >= {args.min_count} times) ===")
    if not rows_out:
        print("  none — the lexicon already agrees with these labels")
    for term, current, suggested, observed, count in rows_out[:40]:
        print(f"  {term:24} {current:+.2f} -> {suggested:+.2f}   "
              f"(corpus mean {observed:+.2f} over {count})")

    if args.write and suggestions:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "custom_words.json")
        existing = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as handle:
                existing = json.load(handle)
        existing.update(suggestions)
        existing.setdefault(
            "_comment",
            "Extra Nepali slang for review sentiment. Score -1.0 (worst) to "
            "+1.0 (best). SINGLE WORDS ONLY. Keys starting with _ are ignored.",
        )
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(existing, handle, ensure_ascii=False, indent=2)
        print(f"\nWrote {len(suggestions)} suggestion(s) into custom_words.json")
    elif args.write:
        print("\nNothing to write.")

    print("\n  Suggestions are a starting point, not an answer. Anything derived")
    print("  from a corpus this lexicon generated is partly circular; only the")
    print("  hand-corrected rows carry independent information.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
