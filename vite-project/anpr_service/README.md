# ANPR inference service

Runs the project's trained YOLO weights locally and serves them over HTTP to the
Node backend, replacing the Roboflow hosted API. Everything runs offline.

## Weights

The service loads three files from `ANPR_WEIGHTS_DIR` (default:
`C:\Users\sauga\Downloads\8th sem Proj.v2i.yolov11\weights`):

| File | Role |
|---|---|
| `plate_detector.pt` | Stage 1 — locates plates in the frame |
| `char_reader.pt` | Stage 2 — 38-class Devanagari character reader (primary) |
| `char_unified.pt` | 57-class reader, challenges the primary on suspected embossed plates |

Point `ANPR_WEIGHTS_DIR` somewhere else to move or version the weights.

## Run

```
pip install -r requirements.txt
python server.py                 # http://127.0.0.1:8000
```

Or from `vite-project/`: `npm run anpr`.

## API

`GET /health` → device, weights directory, whether the embossed reader loaded.

`POST /detect` — request body is the raw image bytes.

| Query param | Default | Meaning |
|---|---|---|
| `plateConf` | 0.25 | Stage-1 confidence threshold |
| `charConf` | 0.25 | Stage-2 confidence threshold |
| `imgsz` | 1280 | Stage-1 analysis resolution; higher finds smaller plates |
| `tiles` | false | Also scan four overlapping tiles — finds small/many plates, costs time |

```json
{
  "detected": true,
  "box": { "x": 422, "y": 237, "width": 264, "height": 202, "confidence": 83.1 },
  "text": "1 9 Pa 4 6 3 0",
  "textConfidence": 80.6,
  "plates": [ ... ]
}
```

`x`/`y` are the box **centre** in source-image pixels; both confidences are
0-100 percentages.

`detected` reports whether stage 1 localized a plate. When it is `false`, `text`
is still a real read — stage 1 is trained on full scenes and finds nothing
inside an already-cropped plate photo, so the service falls back to reading the
whole image. `plates` lists every plate found, best-reading first.

## Notes

- Character detection *is* the OCR. Generic OCR engines cannot read hand-painted
  Devanagari plates; a class-per-character detector can only ever emit valid
  plate characters.
- Inference is serialized behind a lock — Ultralytics models are not safe to
  call concurrently, and the camera poller can scan several cameras at once.
- See `MODEL_REPORT.md` in the weights directory for training details and the
  measured accuracy behind the reader-competition routing.
