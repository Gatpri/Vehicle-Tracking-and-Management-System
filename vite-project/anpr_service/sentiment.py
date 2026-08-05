"""Review sentiment: transformer where it's strong, lexicon where it isn't.

Neither alone is enough.

  - The transformer is excellent on Devanagari and English (0.99 confidence in
    testing) but has never seen Romanized Nepali. Asked about
    "service bakwas thiyo" it answers Neutral at 0.51 — a coin flip.
  - The lexicon knows the slang but only sees words it was told about, so it
    misses anything phrased indirectly.

So: route by script, and let the lexicon override the model whenever the model
is unsure and the lexicon is confident. That last rule is what stops an obvious
complaint being filed as neutral.
"""
import functools
import os
from pathlib import Path

from nepali_lexicon import detect_script, score as lexicon_score

MODEL_ID = "sameerdorjee07/nepali-sentiment-xlmr"
MODEL_VERSION = f"{MODEL_ID}+lexicon-v1"
LOCAL_MODEL_DIR = Path(__file__).resolve().parent / "sentiment_pipeline" / "models" / "finetuned_sentiment"

# The model emits LABEL_0/1/2 rather than words.
LABEL_MAP = {
    "LABEL_0": "negative", "LABEL_1": "neutral", "LABEL_2": "positive",
    "NEGATIVE": "negative", "NEUTRAL": "neutral", "POSITIVE": "positive",
    "Negative": "negative", "Neutral": "neutral", "Positive": "positive",
    "Very Negative": "negative", "Very Positive": "positive",
}

# Below this the model is barely better than guessing, so a confident lexicon
# hit wins. 0.51 on "service bakwas thiyo" is exactly the case in mind.
MODEL_TRUST_FLOOR = 0.60
# Lexicon needs to be clearly polar before it overrules anything.
LEXICON_OVERRIDE_AT = 0.4


@functools.lru_cache(maxsize=1)
def _pipeline():
    """Loaded once, on first use — importing torch at module load would slow
    every process that merely imports this file."""
    from transformers import pipeline
    return pipeline("sentiment-analysis", model=MODEL_ID, truncation=True)


@functools.lru_cache(maxsize=1)
def _local_pipeline():
    if not LOCAL_MODEL_DIR.exists():
        return None
    try:
        from transformers import pipeline
        return pipeline("text-classification", model=str(LOCAL_MODEL_DIR), tokenizer=str(LOCAL_MODEL_DIR), truncation=True)
    except Exception as exc:
        print(f"local fine-tuned model unavailable: {exc}")
        return None


def _model_verdict(text):
    local_pipe = _local_pipeline()
    if local_pipe is not None:
        try:
            raw = local_pipe(text)[0]
            label = raw["label"].lower()
            score = float(raw["score"])
            if label in {"negative", "neutral", "positive"}:
                return label, score
        except Exception as exc:
            print(f"local fine-tuned model failed, falling back to remote model: {exc}")

    try:
        raw = _pipeline()(text)[0]
        return LABEL_MAP.get(raw["label"], "neutral"), float(raw["score"])
    except Exception as exc:
        print(f"sentiment model unavailable, falling back to lexicon: {exc}")
        return None, 0.0


def analyse(text):
    """Returns the shape backend_api/services/sentimentService.js expects."""
    text = (text or "").strip()
    if not text:
        return {
            "label": "neutral", "score": 0.0, "confidence": 0.0,
            "language": "english", "modelVersion": MODEL_VERSION,
        }

    script = detect_script(text)
    lex_value, lex_label, lex_matches = lexicon_score(text)
    lex_strength = abs(lex_value)

    # Romanized: the model has nothing useful to say, so don't ask it.
    if script == "romanized":
        source = "lexicon"
        label, confidence = lex_label, min(0.5 + lex_strength / 2, 0.95)
        value = lex_value
    else:
        model_label, model_confidence = _model_verdict(text)

        if model_label is None:
            source = "lexicon"
            label, confidence, value = lex_label, min(0.5 + lex_strength / 2, 0.9), lex_value
        elif (
            model_confidence < MODEL_TRUST_FLOOR
            and lex_strength >= LEXICON_OVERRIDE_AT
            and lex_label != model_label
        ):
            # The model hedged and the lexicon is sure — take the lexicon, and
            # say so, because a silent override is impossible to debug later.
            source = "lexicon-override"
            label, confidence, value = lex_label, min(0.5 + lex_strength / 2, 0.9), lex_value
        else:
            source = "model"
            label, confidence = model_label, model_confidence
            value = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}[label] * model_confidence

    return {
        "label": label,
        "score": round(value, 3),
        "confidence": round(confidence, 3),
        "language": script,
        "modelVersion": MODEL_VERSION,
        # Not part of the contract, but invaluable when a score looks wrong:
        # it names the deciding words and which half of the system spoke.
        "explain": {"source": source, "matched": lex_matches},
    }


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")

    for sample in [
        "service bakwas thiyo",
        "sewa ramro thiyo",
        "hawa kaam, jhur workshop",
        "ramro chaina",
        "thikai cha",
        "सेवा एकदम राम्रो थियो",
        "धेरै नराम्रो सेवा, पैसा खेर गयो",
        "excellent service, very happy",
        "terrible work, very disappointed",
    ]:
        r = analyse(sample)
        words = ", ".join(m["word"] for m in r["explain"]["matched"]) or "-"
        print(f"  {r['label']:8} {r['score']:+.2f} conf={r['confidence']:.2f} "
              f"[{r['language']:10}] via {r['explain']['source']:16} {sample}")
        print(f"           matched: {words}")
