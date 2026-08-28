import axios from "axios";

const ANPR_SERVICE_URL = process.env.ANPR_SERVICE_URL || "http://127.0.0.1:8000";

// Calls this project's own ANPR sidecar (vite-project/anpr_service), which runs
// the locally trained YOLO weights: stage 1 locates plates in the frame, stage 2
// detects and classifies every character on the crop. Character detection *is*
// the OCR here — generic OCR engines can't read hand-painted Devanagari plates,
// while a class-per-character detector can only ever emit valid plate characters.
//
// Returns:
//   detected   - whether stage 1 localized a plate. When false, `text` is still
//                a real read: the sidecar falls back to reading the whole image,
//                which is what an already-cropped plate upload needs.
//   box        - null unless detected. x/y are the box CENTRE, width/height the
//                box size, all in the source image's pixel coordinates.
//   confidences- 0-100 percentages, both for the box and the character read.
//
// Pass `cameraId` for anything that streams frames from a fixed camera. The
// sidecar then tracks each plate across frames and votes on its text rather
// than trusting whichever single frame arrived: the character reader misses
// roughly one character in five on hard images, but it misses a *different*
// one each frame, so the majority across a few sightings is right far more
// often than any one of them. Without the id every frame is read in isolation,
// which is correct for a one-off upload and wasteful for a camera.
export const analyzeFrame = async (buffer, { tiles = false, cameraId } = {}) => {
  const { data } = await axios.post(`${ANPR_SERVICE_URL}/detect`, buffer, {
    params: cameraId ? { tiles, cameraId } : { tiles },
    headers: { "Content-Type": "application/octet-stream" },
    timeout: 30000,
    maxBodyLength: Infinity,
  });

  return {
    detected: Boolean(data.detected),
    box: data.box ?? null,
    text: data.text ?? "",
    textConfidence: data.textConfidence ?? 0,
    // Source frame size — boxes are in its pixel coordinates, so an overlay
    // drawn over a scaled <img> needs this to convert them.
    frame: data.frame ?? null,
    // Every plate found in the frame, best-reading first. `box`/`text` above are
    // plates[0] — kept flat because callers act on one plate per frame.
    plates: data.plates ?? [],
    // Present only when a cameraId was given. `stable` means the plate has been
    // read consistently across several frames — the bar an alert should clear
    // before it accuses someone of driving a stolen vehicle.
    track: data.plates?.[0]?.track ?? null,
  };
};

export const isAnprReachable = async () => {
  try {
    await axios.get(`${ANPR_SERVICE_URL}/health`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
};
