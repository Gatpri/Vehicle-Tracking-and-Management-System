"""
Measure what the current ANPR pipeline actually does on the heavy-traffic clip.

No changes yet — this is the baseline. Without it, any "improvement" is a
guess, and the interesting question (does it hold up in dense traffic?) is
exactly the one a single-plate test image cannot answer.

Reports, per sampled frame: how many plates stage 1 finds, and for each, how
many characters stage 2 reads and at what confidence.
"""
import os, sys, time
from pathlib import Path

os.environ.setdefault("ANPR_WEIGHTS_DIR", r"C:\Users\sauga\Downloads\8th sem Proj.v2i.yolov11\weights")

import cv2, numpy as np, torch
from ultralytics import YOLO

W = Path(os.environ["ANPR_WEIGHTS_DIR"])
device = 0 if torch.cuda.is_available() else "cpu"
print(f"device: {'gpu' if device == 0 else 'cpu'}  torch {torch.__version__}")

plate_model = YOLO(str(W / "plate_detector.pt"))
char_model = YOLO(str(W / "char_reader.pt"))

SRC = r"C:\Users\sauga\Downloads\Video Project 6.mp4"
cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

# The source is pillarboxed; use the real picture only.
CX, CW = 442, 1035

SAMPLES = 12
print(f"\nsampling {SAMPLES} frames from {n} ({n/fps:.1f}s)\n")

tot_plates = 0
tot_read = 0
t0 = time.time()

for i in range(SAMPLES):
    idx = int(n * (i + 0.5) / SAMPLES)
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    frame = frame[:, CX:CX + CW]

    r = plate_model.predict(frame, conf=0.25, imgsz=1280, device=device,
                            half=(device == 0), verbose=False)[0]
    boxes = [b.xyxy[0].tolist() + [float(b.conf[0])] for b in r.boxes]
    tot_plates += len(boxes)

    reads = []
    for x1, y1, x2, y2, pc in boxes:
        w_, h_ = x2 - x1, y2 - y1
        if w_ < 40 or h_ < 16:
            reads.append(f"[{w_:.0f}x{h_:.0f} too small]")
            continue
        px, py = int(w_ * 0.05), int(h_ * 0.1)
        crop = frame[max(0, int(y1 - py)):int(y2 + py), max(0, int(x1 - px)):int(x2 + px)]
        if crop.size == 0:
            continue
        cr = char_model.predict(crop, conf=0.25, device=device,
                                half=(device == 0), verbose=False)[0]
        nchars = len(cr.boxes)
        mc = float(np.mean([float(b.conf[0]) for b in cr.boxes])) if nchars else 0.0
        if nchars:
            tot_read += 1
        reads.append(f"{w_:.0f}x{h_:.0f} p{pc:.2f} -> {nchars}ch @{mc:.2f}")

    print(f"t={idx/fps:5.1f}s  plates={len(boxes):2d}  " + " | ".join(reads[:6]))

cap.release()
dt = time.time() - t0
print(f"\nTOTAL plates found: {tot_plates}   with >=1 char read: {tot_read}")
print(f"{dt/SAMPLES*1000:.0f} ms/frame end-to-end")
