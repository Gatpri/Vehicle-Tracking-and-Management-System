"""Local ANPR inference sidecar.

Serves the project's own trained YOLO weights over HTTP so the Node backend can
read Nepali plates without calling Roboflow's hosted API. Two stages, same as
cctv_live.py: stage 1 locates plates in the frame, stage 2 detects+classifies
each character on the crop (detection-as-OCR — generic OCR engines cannot read
hand-painted Devanagari).

  python server.py            # http://127.0.0.1:8000
"""
import os
import threading
from pathlib import Path

import cv2
import numpy as np
import torch
import uvicorn
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.routing import Route
from ultralytics import YOLO

WEIGHTS_DIR = Path(
    os.environ.get("ANPR_WEIGHTS_DIR", r"C:\Users\sauga\Downloads\8th sem Proj.v2i.yolov11\weights")
)
PLATE_WEIGHTS = WEIGHTS_DIR / "plate_detector.pt"
CHAR_WEIGHTS = WEIGHTS_DIR / "char_reader.pt"
UNIFIED_WEIGHTS = WEIGHTS_DIR / "char_unified.pt"

# Plates narrower than this carry too few pixels per character to read.
MIN_PLATE_W, MIN_PLATE_H = 40, 16

for required in (PLATE_WEIGHTS, CHAR_WEIGHTS):
    if not required.exists():
        raise SystemExit(
            f"Missing weights: {required}\n"
            "Set ANPR_WEIGHTS_DIR to the folder holding plate_detector.pt and char_reader.pt."
        )

device = 0 if torch.cuda.is_available() else "cpu"
plate_model = YOLO(str(PLATE_WEIGHTS))
char_model = YOLO(str(CHAR_WEIGHTS))
unified_model = YOLO(str(UNIFIED_WEIGHTS)) if UNIFIED_WEIGHTS.exists() else None

# Ultralytics models are not safe to call concurrently, and inference runs on a
# threadpool — serialize it so parallel camera polls queue instead of corrupting
# each other's CUDA state.
infer_lock = threading.Lock()


def box_iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    if inter == 0:
        return 0.0
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union


def contained(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return smaller > 0 and (ix * iy) / smaller > 0.5


def detect_plates(frame, conf, imgsz, tiled=False):
    """Stage 1. With tiled=True the frame is also scanned as four overlapping 60%
    tiles, which recovers small/distant plates the full-frame pass misses."""
    h, w = frame.shape[:2]
    regions = [(0, 0, frame, imgsz)]
    if tiled:
        tw, th = int(w * 0.6), int(h * 0.6)
        for y0 in (0, h - th):
            for x0 in (0, w - tw):
                regions.append((x0, y0, frame[y0:y0 + th, x0:x0 + tw], 640))

    found = []
    for x0, y0, img, sz in regions:
        r = plate_model.predict(img, conf=conf, imgsz=sz, device=device,
                                half=(device == 0), verbose=False)[0]
        for b in r.boxes:
            x1, y1, x2, y2 = b.xyxy[0].tolist()
            found.append((x1 + x0, y1 + y0, x2 + x0, y2 + y0, float(b.conf[0])))

    # Merge duplicates across tiles: a box mostly inside an already-kept one is
    # the same plate clipped at a tile edge.
    found.sort(key=lambda t: -t[4])
    kept = []
    for f in found:
        if all(box_iou(f[:4], k[:4]) < 0.45 and not contained(f[:4], k[:4]) for k in kept):
            kept.append(f)
    return [((int(a), int(b), int(c), int(d)), cf) for a, b, c, d, cf in kept]


def read_plate(model, plate_img, conf):
    """Stage 2. Returns (text, mean character confidence) in plate reading order."""
    results = model.predict(plate_img, conf=conf, device=device,
                            half=(device == 0), verbose=False)[0]
    if len(results.boxes) == 0:
        return "", 0.0

    boxes, confs = [], []
    for b in results.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        name = model.names[int(b.cls)]
        dup = False
        for ox1, oy1, ox2, oy2, oname in boxes:
            ox = min(x2, ox2) - max(x1, ox1)
            oy = min(y2, oy2) - max(y1, oy1)
            if (oname == name
                    and ox > 0.6 * min(x2 - x1, ox2 - ox1)
                    and oy > 0.6 * min(y2 - y1, oy2 - oy1)):
                dup = True
                break
        if not dup:
            boxes.append((x1, y1, x2, y2, name))
            confs.append(float(b.conf[0]))

    # Group into rows (two-line plates): characters whose y-centres sit within
    # half a character height belong to the same line.
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    avg_h = sum(b[3] - b[1] for b in boxes) / len(boxes)
    rows, current = [], [boxes[0]]
    for b in boxes[1:]:
        prev_cy = (current[-1][1] + current[-1][3]) / 2
        cy = (b[1] + b[3]) / 2
        if cy - prev_cy > avg_h * 0.5:
            rows.append(current)
            current = [b]
        else:
            current.append(b)
    rows.append(current)

    tokens = []
    for row in rows:
        row.sort(key=lambda b: b[0])
        for *_, name in row:
            if name == "Nepali Flag":
                continue
            # Word tokens (Bagmati, Pradesh) never repeat back-to-back on a real
            # plate — a repeat is one word split across two boxes. Digits may repeat.
            if len(name) > 2 and tokens and tokens[-1] == name:
                continue
            tokens.append(name)

    return " ".join(tokens), (sum(confs) / len(confs) if confs else 0.0)


def read_best(crop, char_conf):
    """Primary 38-class Devanagari reader, with the unified 57-class model
    challenging it when the read looks like an embossed (Latin) plate."""
    text, conf = read_plate(char_model, crop, char_conf)
    tokens = text.split()
    suspicious = len(tokens) < 3 or all(t.isdigit() for t in tokens) or conf < 0.7
    if not suspicious or unified_model is None:
        return text, conf

    alt, alt_conf = read_plate(unified_model, crop, char_conf)
    # The specialist is the incumbent: a challenger must beat its score by a
    # clear margin (x1.2) to override. Score = characters read x mean confidence.
    if len(alt.replace(" ", "")) * alt_conf > len(text.replace(" ", "")) * conf * 1.2:
        return alt, alt_conf
    return text, conf


async def health(request):
    return JSONResponse({
        "status": "ok",
        "device": "gpu" if device == 0 else "cpu",
        "weightsDir": str(WEIGHTS_DIR),
        "embossedReader": unified_model is not None,
    })


def analyze(body, plate_conf, char_conf, imgsz, tiles):
    raw = np.frombuffer(body, np.uint8)
    frame = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if frame is None:
        return {"detected": False, "plates": [], "error": "Image could not be decoded"}

    # Boxes are in source-image pixels, so a caller drawing an overlay on a
    # scaled-down <img> needs the frame size to convert them.
    frame_size = {"width": int(frame.shape[1]), "height": int(frame.shape[0])}

    with infer_lock:
        found = detect_plates(frame, plate_conf, imgsz, tiled=tiles)

        plates = []
        for (x1, y1, x2, y2), conf in found:
            if x2 - x1 < MIN_PLATE_W or y2 - y1 < MIN_PLATE_H:
                continue
            # Pad the crop so edge characters are not clipped.
            px, py = int((x2 - x1) * 0.05), int((y2 - y1) * 0.1)
            crop = frame[max(0, y1 - py):y2 + py, max(0, x1 - px):x2 + px]
            if crop.size == 0:
                continue
            text, text_conf = read_best(crop, char_conf)
            plates.append({
                "box": {
                    "x": (x1 + x2) / 2,
                    "y": (y1 + y2) / 2,
                    "width": x2 - x1,
                    "height": y2 - y1,
                    "confidence": conf * 100,
                },
                "text": text,
                "textConfidence": text_conf * 100,
            })

    if not plates:
        # Stage 1 is trained on full scenes, so it finds nothing when handed an
        # already-cropped plate photo — which is exactly what a manual upload
        # usually is. Read the whole image instead of giving up.
        with infer_lock:
            text, text_conf = read_best(frame, char_conf)
        return {
            "detected": False,
            "box": None,
            "text": text,
            "textConfidence": text_conf * 100,
            "plates": [],
            "frame": frame_size,
        }

    # Node consumers act on a single plate per frame; lead with the one that
    # actually read best rather than the largest/most confident empty box.
    plates.sort(key=lambda p: -(len(p["text"].replace(" ", "")) * p["textConfidence"]))
    best = plates[0]
    return {"detected": True, **best, "plates": plates, "frame": frame_size}


async def detect(request):
    """Locate and read every plate in one frame.

    The request body is the raw image bytes. Boxes come back in the shape the
    existing overlay already draws — x/y are the box CENTRE, in the source
    image's pixel coordinates — and both confidences as 0-100 percentages.
    """
    body = await request.body()
    if not body:
        return JSONResponse({"detected": False, "plates": [], "error": "Empty request body"}, status_code=400)

    q = request.query_params
    result = await run_in_threadpool(
        analyze,
        body,
        float(q.get("plateConf", 0.25)),
        float(q.get("charConf", 0.25)),
        int(q.get("imgsz", 1280)),
        q.get("tiles", "false").lower() == "true",
    )
    return JSONResponse(result)


app = Starlette(routes=[
    Route("/health", health),
    Route("/detect", detect, methods=["POST"]),
])


if __name__ == "__main__":
    print(f"ANPR inference on {'GPU' if device == 0 else 'CPU'} · weights: {WEIGHTS_DIR}")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("ANPR_PORT", 8000)))
