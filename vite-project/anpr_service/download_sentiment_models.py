"""Download the sentiment models used by the review analyser.

Run once, with a network connection:

    pip install transformers huggingface_hub
    python download_sentiment_models.py

Models are cached under %USERPROFILE%\\.cache\\huggingface\\hub and loaded from
there forever after — the service never needs the network again. Set HF_HOME
before running to put the cache somewhere else (a different drive, say).

Re-running is cheap: anything already cached is skipped.
"""
import os
import sys

# Chosen by measurement, not by model card — run benchmark_sentiment_models.py
# to reproduce. Scores are on a 10-sentence hand-labelled set, so they rank
# candidates rather than establish accuracy.
#
# Deliberately NOT included:
#   sibendra/nepali-sentiment-analysis    - the repo has no weights at all,
#                                           only training notebooks
#   rohanrajpal/...codemixed-...          - scored worst on Romanized (1/4)
#                                           despite being Hinglish-trained
MODELS = [
    (
        "sameerdorjee07/nepali-sentiment-xlmr",
        "PRIMARY — Devanagari 4/4, English 2/2. Returns neutral on Romanized "
        "rather than guessing, which is the failure mode you want.",
    ),
    (
        "tabularisai/multilingual-sentiment-analysis",
        "Fallback — Devanagari 3/4, English 2/2. Useful second opinion.",
    ),
]


def human(num_bytes):
    for unit in ("B", "KB", "MB", "GB"):
        if num_bytes < 1024:
            return f"{num_bytes:.1f}{unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f}TB"


def directory_size(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total


def main():
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print("huggingface_hub isn't installed.\n")
        print("  pip install transformers huggingface_hub\n")
        return 1

    print(f"Downloading {len(MODELS)} sentiment models...\n")
    failures = []

    for repo_id, purpose in MODELS:
        print(f"  {repo_id}")
        print(f"    {purpose}")
        try:
            # allow_patterns keeps this to what inference needs — the repos also
            # carry TensorFlow/Flax copies of the same weights, which would
            # double or triple the download for nothing.
            path = snapshot_download(
                repo_id,
                allow_patterns=[
                    "*.json", "*.txt", "*.model",
                    "pytorch_model.bin", "model.safetensors",
                ],
            )
            print(f"    cached: {human(directory_size(path))}\n")
        except Exception as exc:  # network, auth, gated repo, disk...
            print(f"    FAILED: {exc}\n")
            failures.append(repo_id)

    if failures:
        print("Some downloads failed:")
        for repo_id in failures:
            print(f"  - {repo_id}")
        print("\nCheck the network, then re-run — cached models are skipped.")
        return 1

    print("All models cached. The service can now run offline.")
    print("\nQuick check that one actually loads and classifies:")
    print('  python -c "from transformers import pipeline; '
          "p=pipeline('sentiment-analysis', model='sameerdorjee07/nepali-sentiment-xlmr'); "
          "print(p('the service was excellent'))\"")
    print("\nIf `import transformers` segfaults, it is almost certainly a stale")
    print("markupsafe binary rather than your Python version:")
    print("  pip install --upgrade --force-reinstall markupsafe")
    return 0


if __name__ == "__main__":
    sys.exit(main())
