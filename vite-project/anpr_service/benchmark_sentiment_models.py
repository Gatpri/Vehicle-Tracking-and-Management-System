"""Benchmark candidate Nepali sentiment models on a small hand-labelled set."""
import warnings
warnings.filterwarnings("ignore")
import sys
from transformers import pipeline

CANDIDATES = [
    "bhattaraisuman/nepali-sentiment-mbert",
    "DGurgurov/xlm-r_nepali_sentiment",
    "sameerdorjee07/nepali-sentiment-xlmr",
    "luluw/Nepali-BERT-devangari-sentiment",
    "ecabott/nepali-sentiment-analysis",
    "tabularisai/multilingual-sentiment-analysis",
    "rohanrajpal/bert-base-multilingual-codemixed-cased-sentiment",
]

# (text, script, expected polarity)
TESTS = [
    ("सेवा एकदम राम्रो थियो, धन्यवाद",      "devanagari", "pos"),
    ("काम राम्रो भयो, खुसी लाग्यो",          "devanagari", "pos"),
    ("धेरै नराम्रो सेवा, पैसा खेर गयो",       "devanagari", "neg"),
    ("बिग्रेको गाडी झन् बिग्रियो",            "devanagari", "neg"),
    ("sewa ramro thiyo",                     "romanized",  "pos"),
    ("kaam ekdam ramro cha, dhanyabad",      "romanized",  "pos"),
    ("kaam naramro bhayo, paisa khera gayo", "romanized",  "neg"),
    ("gaadi bigriyo, service ekdam kharab",  "romanized",  "neg"),
    ("excellent service, very happy",        "english",    "pos"),
    ("terrible work, very disappointed",     "english",    "neg"),
]


def polarity(label):
    """Normalise the wildly different label vocabularies to pos/neg/neu."""
    l = str(label).lower()
    if l in ("label_0", "0", "negative", "neg", "very negative"): return "neg"
    if l in ("label_1", "1"): return "neu"
    if l in ("label_2", "2", "positive", "pos", "very positive"): return "pos"
    if "very neg" in l or "negative" in l: return "neg"
    if "very pos" in l or "positive" in l: return "pos"
    if "neutral" in l: return "neu"
    if l.startswith("1 star") or l.startswith("2 star"): return "neg"
    if l.startswith("4 star") or l.startswith("5 star"): return "pos"
    if l.startswith("3 star"): return "neu"
    return l


for model_id in CANDIDATES:
    print(f"\n=== {model_id} ===")
    try:
        pipe = pipeline("sentiment-analysis", model=model_id, device=-1, truncation=True)
    except Exception as exc:
        print(f"  LOAD FAILED: {str(exc)[:120]}")
        continue

    by_script = {}
    for text, script, expected in TESTS:
        try:
            out = pipe(text)[0]
            got = polarity(out["label"])
            ok = got == expected
        except Exception as exc:
            got, ok = f"err:{str(exc)[:30]}", False
        by_script.setdefault(script, []).append(ok)
        mark = "OK " if ok else "  X"
        print(f"  {mark} [{script:10}] want={expected} got={got:4}  {text[:42]}")

    print("  ---")
    for script, results in by_script.items():
        print(f"  {script:10}: {sum(results)}/{len(results)}")
    total = [r for rs in by_script.values() for r in rs]
    print(f"  OVERALL   : {sum(total)}/{len(total)}")
