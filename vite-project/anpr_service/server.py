"""Local ANPR inference sidecar with LLM sentiment analysis.

Serves the project's own trained YOLO weights over HTTP so the Node backend can
read Nepali plates without calling Roboflow's hosted API. Two stages, same as
cctv_live.py: stage 1 locates plates in the frame, stage 2 detects+classifies
each character on the crop (detection-as-OCR — generic OCR engines cannot read
hand-painted Devanagari).

Also provides LLM-based sentiment analysis using Gemini Flash 2.5 with Mistral fallback.

  python server.py            # http://127.0.0.1:8000
"""
import base64
import os
import threading
from pathlib import Path

# Load the single consolidated .env at the repo root before anything reads
# os.environ, so this service shares one config file with the Node backend and
# the Vite frontend instead of keeping its own copy. Real environment
# variables take precedence, so Docker-injected config always wins.
#
# Walk upwards rather than indexing a fixed parent: on the host this file is
# at <repo>/vite-project/anpr_service/server.py, but the container flattens it
# to /app/server.py, where a hardcoded parents[2] does not exist at all.
try:
    from dotenv import load_dotenv

    for _candidate in Path(__file__).resolve().parents:
        _env = _candidate / ".env"
        if _env.is_file():
            load_dotenv(_env, override=False)
            break
except ImportError:  # python-dotenv is optional; env vars may be exported already
    pass

import cv2
import numpy as np
import torch
import uvicorn
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.routing import Route
from ultralytics import YOLO

from tracking import TrackerRegistry

# Import Gemini Flash 2.5 (+ Mistral fallback) sentiment analyzer
try:
    from llm_sentiment import analyze_sentiment as llm_analyze_sentiment
    LLM_SENTIMENT_AVAILABLE = True
except ImportError:
    LLM_SENTIMENT_AVAILABLE = False
    print("Warning: LLM sentiment module not available. Install required packages:")
    print("  pip install google-generativeai mistralai")

WEIGHTS_DIR = Path(
    os.environ.get("ANPR_WEIGHTS_DIR", r"C:\Users\sauga\Downloads\8th sem Proj.v2i.yolov11\weights")
)
# Stage 1 prefers the Nepal-specific detector when it is present.
#
# The stock plate_detector.pt was never trained on Nepali data — MODEL_REPORT
# names this as a known limitation — and measured on real Kathmandu traffic it
# scored ~0.28 on genuine plates while scoring 0.75 on burnt-in overlay
# graphics. plate_detector_nepali.pt is that same model fine-tuned on 6,927
# Nepali plate images. Falling back keeps the service running on a machine
# that only has the original weights.
NEPALI_PLATE_WEIGHTS = WEIGHTS_DIR / "plate_detector_nepali.pt"
PLATE_WEIGHTS = NEPALI_PLATE_WEIGHTS if NEPALI_PLATE_WEIGHTS.exists() else WEIGHTS_DIR / "plate_detector.pt"
CHAR_WEIGHTS = WEIGHTS_DIR / "char_reader.pt"
UNIFIED_WEIGHTS = WEIGHTS_DIR / "char_unified.pt"

# Plates narrower than this carry too few pixels per character to read.
MIN_PLATE_W, MIN_PLATE_H = 40, 16

for required in (PLATE_WEIGHTS, CHAR_WEIGHTS):  # noqa: B007
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

# Multi-frame voting state, one tracker per camera. Frames arrive as separate
# HTTP requests, so this is what turns a stream of independent stills back
# into a video the pipeline can reason over. See tracking.py.
trackers = TrackerRegistry()


def warm_models():
    """Run one throwaway inference through every model at import time.

    The first predict() on a model builds CUDA graphs, allocates workspace and
    compiles kernels. Measured here, that made the first real request take
    ~21s against ~1.2s for every one after it — so without this the first
    camera frame after a restart appears to hang, and a caller with a timeout
    records it as a failure. Paying it at startup, once, on a blank image, is
    strictly better than making a user pay it.
    """
    blank = np.zeros((320, 320, 3), np.uint8)
    strip = np.zeros((64, 200, 3), np.uint8)
    try:
        plate_model.predict(blank, device=device, half=(device == 0), verbose=False)
        char_model.predict([strip], device=device, half=(device == 0), verbose=False)
        if unified_model is not None:
            unified_model.predict([strip], device=device, half=(device == 0), verbose=False)
    except Exception as exc:  # never block startup on a warm-up failure
        print(f"Model warm-up skipped: {exc}")


warm_models()


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


def read_plates_batch(model, crops, conf):
    """Stage 2 over every crop in one frame, in a single predict() call.

    Ultralytics accepts a list of images and batches them onto the GPU. Calling
    it once per crop — which is what this did before — pays the full
    preprocess/postprocess and kernel-launch overhead per plate, and in dense
    traffic there are five to eight plates per frame. Batching is the
    difference between the pipeline being usable on live video and not.

    Returns a list of (text, mean confidence), aligned with `crops`.
    """
    if not crops:
        return []
    results = model.predict(crops, conf=conf, device=device,
                            half=(device == 0), verbose=False)
    return [_decode_chars(model, r) for r in results]


def read_plate(model, plate_img, conf):
    """Stage 2 for a single crop. Returns (text, mean character confidence)."""
    results = model.predict(plate_img, conf=conf, device=device,
                            half=(device == 0), verbose=False)[0]
    return _decode_chars(model, results)


def _decode_chars(model, results):
    """Turn one crop's character detections into plate text.

    Shared by the single-crop and batched paths so the two cannot drift: row
    grouping, reading order and dedup are the fiddly part, and having two
    copies of it would guarantee they disagree eventually.
    """
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


# Display size for the plate crop sent back to the UI. This is presentation
# only — it is deliberately NOT applied before the character reader.
#
# Measured on a real plate downscaled to 80/120/160/240px wide: pre-upscaling
# the crop changed mean confidence by roughly +/-1% and at 120px it actually
# dropped a character ("Ga 6 5 Pa 2 1 9 0" -> "6 5 Pa 2 1 9 0"). YOLO already
# letterboxes its input to imgsz internally, so resampling first just adds
# interpolation artefacts for it to chew through. Zooming helps a human read a
# distant plate; it does not help this model.
CROP_DISPLAY_MIN_W = 320
CROP_DISPLAY_MAX_SCALE = 6.0


def upscale_for_display(crop):
    """Enlarge a small plate crop so a person can actually see it in the UI.

    Returns the crop unchanged when it is already large enough.
    """
    h, w = crop.shape[:2]
    if w == 0 or h == 0 or w >= CROP_DISPLAY_MIN_W:
        return crop
    scale = min(CROP_DISPLAY_MIN_W / w, CROP_DISPLAY_MAX_SCALE)
    return cv2.resize(crop, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)


def encode_crop(crop):
    """JPEG-encode a plate crop as a data URI for display in the browser.

    Returns None on failure — the crop is a nicety, never a reason to fail a
    read that otherwise succeeded.
    """
    try:
        ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")
    except Exception:
        return None


def read_best_batch(crops, char_conf):
    """Batched counterpart of read_best.

    The primary reader runs over every crop in one call. Only the crops whose
    read looks suspect are re-run through the unified model, and those go as a
    second batch rather than one call each — on a frame of ordinary traffic
    most plates are Devanagari and never need the challenger at all.
    """
    if not crops:
        return []

    primary = read_plates_batch(char_model, crops, char_conf)
    if unified_model is None:
        return primary

    suspect_idx, suspect_crops = [], []
    for i, (text, conf) in enumerate(primary):
        tokens = text.split()
        if len(tokens) < 3 or all(t.isdigit() for t in tokens) or conf < 0.7:
            suspect_idx.append(i)
            suspect_crops.append(crops[i])

    if not suspect_crops:
        return primary

    out = list(primary)
    for i, (alt, alt_conf) in zip(suspect_idx, read_plates_batch(unified_model, suspect_crops, char_conf)):
        text, conf = primary[i]
        # Same rule as read_best: the specialist is the incumbent and a
        # challenger must beat it by a clear margin to override.
        if len(alt.replace(" ", "")) * alt_conf > len(text.replace(" ", "")) * conf * 1.2:
            out[i] = (alt, alt_conf)
    return out


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
        "plateWeights": PLATE_WEIGHTS.name,
        "nepaliPlateDetector": PLATE_WEIGHTS.name == "plate_detector_nepali.pt",
        "tracking": trackers.stats(),
        "llmSentiment": LLM_SENTIMENT_AVAILABLE,
    })


def analyze(body, plate_conf, char_conf, imgsz, tiles, camera_id=None):
    raw = np.frombuffer(body, np.uint8)
    frame = cv2.imdecode(raw, cv2.IMREAD_COLOR)
    if frame is None:
        return {"detected": False, "plates": [], "error": "Image could not be decoded"}

    # Boxes are in source-image pixels, so a caller drawing an overlay on a
    # scaled-down <img> needs the frame size to convert them.
    frame_size = {"width": int(frame.shape[1]), "height": int(frame.shape[0])}

    with infer_lock:
        found = detect_plates(frame, plate_conf, imgsz, tiled=tiles)

        # Collect every crop first, then read them all in one batched call.
        boxes, crops = [], []
        for (x1, y1, x2, y2), conf in found:
            if x2 - x1 < MIN_PLATE_W or y2 - y1 < MIN_PLATE_H:
                continue
            # Pad the crop so edge characters are not clipped.
            px, py = int((x2 - x1) * 0.05), int((y2 - y1) * 0.1)
            crop = frame[max(0, y1 - py):y2 + py, max(0, x1 - px):x2 + px]
            if crop.size == 0:
                continue
            boxes.append(((x1, y1, x2, y2), conf))
            crops.append(crop)

        reads = read_best_batch(crops, char_conf)

        plates = []
        for ((x1, y1, x2, y2), conf), crop, (text, text_conf) in zip(boxes, crops, reads):
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
                # The located plate on its own, enlarged for legibility, so the
                # UI can show what was read rather than asking the operator to
                # squint at a box on the full frame.
                "cropImage": encode_crop(upscale_for_display(crop)),
                "_box": (x1, y1, x2, y2),
                "_tokens": text.split(),
                "_conf": text_conf,
            })

    # Multi-frame voting. Only when the caller says which camera this frame came
    # from: without that key, frames from different roads would vote on each
    # other's plates, and a one-off upload has no history to vote over anyway.
    if camera_id and plates:
        voted = trackers.get(camera_id).update(
            [(p["_box"], p["_tokens"], p["_conf"]) for p in plates]
        )
        for p, v in zip(plates, voted):
            # The single-frame read stays on the record: when the vote and the
            # frame disagree, an operator needs to see both rather than be told
            # only the conclusion.
            p["frameText"] = p["text"]
            p["frameTextConfidence"] = p["textConfidence"]
            if v["text"]:
                p["text"] = v["text"]
                p["textConfidence"] = v["confidence"] * 100
            p["track"] = {
                "id": v["trackId"],
                "sightings": v["sightings"],
                "stable": v["stable"],
                "ageSeconds": v["ageSeconds"],
            }

    for p in plates:
        p.pop("_box", None)
        p.pop("_tokens", None)
        p.pop("_conf", None)

    if not plates:
        # Stage 1 is trained on full scenes, so it finds nothing when handed an
        # already-cropped plate photo — which is exactly what a manual upload
        # usually is. Read the whole image instead of giving up.
        with infer_lock:
            text, text_conf = read_best(frame, char_conf)

        # A successful full-frame read IS a detection: the characters were
        # recognised, only the locating box is missing. Reporting False here
        # made every consumer discard the text — cctvController returns early
        # on `!read.detected`, so a correctly-read plate never reached the UI.
        #
        # Requires BOTH readable characters and non-zero confidence: some
        # frames come back with whitespace-only text at 0.0 confidence, which
        # is the reader finding nothing, not a plate. Blank and noise frames
        # score 0.0 here, so junk still reports False.
        cleaned = text.strip()
        return {
            "detected": bool(cleaned) and text_conf > 0,
            "box": None,
            "text": text,
            "textConfidence": text_conf * 100,
            "plates": [],
            # No located plate to crop — the whole frame was the "crop", and
            # echoing it back would just resend the image the caller uploaded.
            "cropImage": None,
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
        # Pass ?cameraId=... to enable multi-frame voting for that feed. Absent,
        # each frame is read on its own exactly as before, which is the right
        # behaviour for a one-off upload.
        q.get("cameraId") or None,
    )
    return JSONResponse(result)


async def sentiment_health(request):
    """Check if Gemini Flash 2.5 (+ Mistral fallback) sentiment analysis is available."""
    return JSONResponse({
        "available": LLM_SENTIMENT_AVAILABLE,
        "service": "gemini-flash-2.5+mistral-fallback",
        "gemini_api_key_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "mistral_api_key_configured": bool(os.environ.get("MISTRAL_API_KEY")),
    })


async def analyze_sentiment(request):
    """Analyze sentiment of text using Gemini Flash 2.5, falling back to Mistral.

    Request body: {"text": "text to analyze"}
    Returns: Sentiment analysis result
    """
    if not LLM_SENTIMENT_AVAILABLE:
        return JSONResponse({
            "error": "LLM sentiment analysis not available",
            "label": "unavailable",
            "score": 0.0,
            "confidence": 0.0,
            "language": "unknown",
            "modelVersion": "unavailable",
            "explain": {"source": "module_not_loaded", "reasoning": "LLM sentiment module not loaded"}
        }, status_code=503)

    try:
        data = await request.json()
        text = data.get("text", "").strip()

        if not text:
            return JSONResponse({
                "label": "neutral",
                "score": 0.0,
                "confidence": 0.0,
                "language": "english",
                "modelVersion": "empty_text",
                "explain": {"source": "empty_text", "matched": []}
            })

        # Analyze sentiment: Gemini Flash 2.5 first, Mistral as fallback
        result = await run_in_threadpool(llm_analyze_sentiment, text)
        return JSONResponse(result)
        
    except Exception as e:
        return JSONResponse({
            "error": str(e),
            "label": "unavailable",
            "score": 0.0,
            "confidence": 0.0,
            "language": "unknown",
            "modelVersion": "error",
            "explain": {"source": "error", "matched": []}
        }, status_code=500)


app = Starlette(routes=[
    Route("/health", health),
    Route("/detect", detect, methods=["POST"]),
    Route("/sentiment/health", sentiment_health),
    Route("/sentiment", analyze_sentiment, methods=["POST"]),
])


if __name__ == "__main__":
    print(f"ANPR inference on {'GPU' if device == 0 else 'CPU'} · weights: {WEIGHTS_DIR}")
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("ANPR_PORT", 8000)))
