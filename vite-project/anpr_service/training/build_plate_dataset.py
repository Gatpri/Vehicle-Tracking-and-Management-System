"""
Build a single-class Nepali plate-LOCATION dataset for stage 1.

Why this exists
---------------
MODEL_REPORT.md already names the weakness this fixes:

    "Plate detector (stage 1) is generic (not Nepal-specific); distant/tiny
     plates (<40px wide) are skipped by design."

Stage 2 (the character reader) is trained on 5,298 Nepali images and is
strong. Stage 1 was never trained on Nepali data at all — it is a stock
License_Plate detector. Measured on real Kathmandu traffic it scores ~0.28 on
genuine plates, which is why plates get missed before the good reader ever
sees them. Fixing stage 1 is the highest-leverage change available.

Sources
-------
1. "Number plate detection nepali.v1i.yolov11" — 319 real Nepali road images
   annotated with plate boxes. Its data.yaml declares four classes:
       ['4', 'number plate', 'numberplate', 'objects']
   but the label histogram shows what they actually are:
       class 1 ('number plate') : 344 objects   93%
       class 3 ('objects')      :  15 objects
       class 0 ('4')            :   5 objects
       class 2 ('numberplate')  :   1 object
   Three of the four are annotation noise — duplicate names and a junk
   'objects' bucket. Since stage 1 only has to answer "is there a plate here",
   every box is remapped to a single class rather than trying to preserve a
   taxonomy that was never real.

2. The existing 8th-sem character dataset, mined for plate boxes. Those images
   are crops of *single plates* labelled per character, so the union of all
   character boxes on an image approximates that plate's extent. This adds
   thousands of close-up plate examples, which balances the road-scene images
   that are mostly distant plates.

The output is a normal YOLO detection dataset with nc=1, ready for
`yolo train`.
"""

import glob
import os
import shutil
from pathlib import Path

NEW = Path(r"C:\Users\sauga\Downloads\Number plate detection nepali.v1i.yolov11")
OLD = Path(r"C:\Users\sauga\Downloads\8th sem Proj.v2i.yolov11")
OUT = Path(r"C:\Users\sauga\Downloads\plate_detect_nepali")

# From the old set, one plate box per image is derived from the union of its
# character boxes. Images with fewer than this many characters are skipped:
# a couple of stray boxes do not describe a plate's extent.
MIN_CHARS_FOR_UNION = 4

# The union of character boxes stops at the outermost glyphs, which sits
# inside the plate's actual border. Grow it slightly so the box looks like a
# plate rather than like the text on one — stage 1 must learn the whole plate.
UNION_PAD_X = 0.06
UNION_PAD_Y = 0.16


def reset_output():
    if OUT.exists():
        shutil.rmtree(OUT)
    for split in ("train", "valid", "test"):
        (OUT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT / split / "labels").mkdir(parents=True, exist_ok=True)


def copy_road_images():
    """Source 1: real road scenes, every class collapsed to 0."""
    counts = {}
    for split in ("train", "valid", "test"):
        img_dir = NEW / split / "images"
        lbl_dir = NEW / split / "labels"
        if not img_dir.is_dir():
            continue
        n = 0
        for img in sorted(img_dir.iterdir()):
            lbl = lbl_dir / (img.stem + ".txt")
            if not lbl.is_file():
                continue
            rows = []
            for line in lbl.read_text().splitlines():
                parts = line.split()
                if len(parts) < 5:
                    continue
                # Class id discarded on purpose — see the module docstring.
                rows.append("0 " + " ".join(parts[1:5]))
            if not rows:
                continue
            stem = f"road_{split}_{img.stem}"
            shutil.copy2(img, OUT / split / "images" / (stem + img.suffix))
            (OUT / split / "labels" / (stem + ".txt")).write_text("\n".join(rows) + "\n")
            n += 1
        counts[split] = n
    return counts


def copy_plate_crops():
    """Source 2: character-labelled plate crops, unioned into one plate box."""
    counts = {}
    for split in ("train", "valid", "test"):
        img_dir = OLD / split / "images"
        lbl_dir = OLD / split / "labels"
        if not img_dir.is_dir():
            continue
        n = 0
        for img in sorted(img_dir.iterdir()):
            lbl = lbl_dir / (img.stem + ".txt")
            if not lbl.is_file():
                continue

            xs1, ys1, xs2, ys2 = [], [], [], []
            for line in lbl.read_text().splitlines():
                p = line.split()
                if len(p) < 5:
                    continue
                cx, cy, w, h = (float(v) for v in p[1:5])
                xs1.append(cx - w / 2)
                ys1.append(cy - h / 2)
                xs2.append(cx + w / 2)
                ys2.append(cy + h / 2)

            if len(xs1) < MIN_CHARS_FOR_UNION:
                continue

            x1, y1 = max(0.0, min(xs1) - UNION_PAD_X), max(0.0, min(ys1) - UNION_PAD_Y)
            x2, y2 = min(1.0, max(xs2) + UNION_PAD_X), min(1.0, max(ys2) + UNION_PAD_Y)
            cx, cy, w, h = (x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1
            if w <= 0.02 or h <= 0.02:
                continue

            stem = f"crop_{split}_{img.stem}"
            shutil.copy2(img, OUT / split / "images" / (stem + img.suffix))
            (OUT / split / "labels" / (stem + ".txt")).write_text(
                f"0 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n"
            )
            n += 1
        counts[split] = n
    return counts


def write_yaml():
    (OUT / "data.yaml").write_text(
        "# Single-class Nepali plate-LOCATION set for ANPR stage 1.\n"
        "# Built by build_plate_dataset.py from two sources:\n"
        "#   - Number plate detection nepali.v1i (real road scenes, classes collapsed)\n"
        "#   - 8th sem Proj.v2i (character labels unioned into one plate box)\n"
        f"path: {OUT.as_posix()}\n"
        "train: train/images\n"
        "val: valid/images\n"
        "test: test/images\n"
        "\n"
        "nc: 1\n"
        "names: ['License_Plate']\n"
    )


if __name__ == "__main__":
    reset_output()
    road = copy_road_images()
    crop = copy_plate_crops()
    write_yaml()

    print("road scenes :", road)
    print("plate crops :", crop)
    print()
    for split in ("train", "valid", "test"):
        n = len(glob.glob(str(OUT / split / "images" / "*")))
        print(f"{split:6s}: {n} images")
    print(f"\nwrote {OUT / 'data.yaml'}")
