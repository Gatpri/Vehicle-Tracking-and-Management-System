import Vehicle from "../models/Vehicle.js";
import Camera from "../models/Camera.js";
import CameraSighting from "../models/CameraSighting.js";
import SOSAlert from "../models/SOSAlert.js";
import { uploadImage } from "../services/cloudinaryService.js";
import { analyzeFrame } from "../services/anprService.js";
import { fetchFrame } from "../services/frameFetcherService.js";
import { normalizePlate } from "../utils/plateMatch.js";
import { getIO } from "../config/socket.js";

// A stolen plate parked in view of a live-detect tile would otherwise re-alert
// every 1.5s. One alert per vehicle per camera per this window is enough for
// the owner to act on; the sighting log still records every scan.
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;
const lastAlertAt = new Map();

const alertCooldownPassed = (vehicleId, cameraId) => {
  const key = `${vehicleId}:${cameraId}`;
  const now = Date.now();
  if (now - (lastAlertAt.get(key) ?? 0) < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(key, now);
  // The map only ever holds one entry per vehicle/camera pair, but drop stale
  // ones so a long-running server doesn't accumulate retired cameras forever.
  if (lastAlertAt.size > 500) {
    for (const [k, t] of lastAlertAt) {
      if (now - t > ALERT_COOLDOWN_MS) lastAlertAt.delete(k);
    }
  }
  return true;
};

// Pushes a stolen-vehicle sighting to the admins and to the vehicle's owner.
// The vehicle is populated first so both the admin banner and the owner's
// breaking-alert overlay can render plate/make/model and the owner's own
// vehicle photos without a follow-up request.
const alertStolenSighting = async (sighting) => {
  const populated = await sighting.populate(
    "matchedVehicle",
    "plateNumber make model color vehicleType images owner"
  );
  getIO().to("admins").emit("theft:sighting", populated);
  getIO().to(`user:${populated.matchedVehicle.owner}`).emit("theft:sighting", populated);
  return populated;
};

// The actual detection pipeline: read the plate with the locally trained YOLO
// models (anpr_service), match it against registered vehicles, persist the
// sighting, and alert admins/the owner on a stolen match. Shared by the manual
// upload endpoint below and the automated camera poller
// (services/cameraPollerService.js) so both go through identical
// matching/alerting logic — only where the frame comes from differs.
export const processFrame = async ({ buffer, cameraId, location, tiles = false }) => {
  // A sighting with no text is still worth recording (the image is the
  // evidence), so a sidecar that's down degrades the scan instead of failing it.
  const readPlate = analyzeFrame(buffer, { tiles }).catch((err) => {
    console.error("ANPR service unavailable, recording sighting without a plate read:", err.message);
    return { detected: false, box: null, text: "", textConfidence: 0 };
  });

  const [imageUrl, read] = await Promise.all([
    uploadImage(buffer, "cctv-sightings"),
    readPlate,
  ]);

  const text = read.text;
  const confidence = read.textConfidence;
  const plateDetected = read.detected;
  const plateDetectionConfidence = read.box?.confidence ?? 0;

  const normalized = normalizePlate(text);
  const matchedVehicle = normalized
    ? await Vehicle.findOne({ normalizedPlate: normalized })
    : null;
  const matchedStolen = matchedVehicle?.status === "stolen";

  const sighting = await CameraSighting.create({
    imageUrl,
    recognizedPlateText: text,
    normalizedPlateText: normalized,
    confidence,
    plateDetected,
    plateDetectionConfidence,
    matchedVehicle: matchedVehicle?._id ?? null,
    matchedStolen,
    cameraId: cameraId || "manual-upload",
    location: location ?? { lat: null, lng: null },
  });

  if (matchedStolen && alertCooldownPassed(matchedVehicle._id, sighting.cameraId)) {
    await alertStolenSighting(sighting);
  }

  return sighting;
};

// Stands in for "a camera captured this frame" — no physical CCTV hardware
// is wired up, so a REST upload plays that role.
export const scanImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "An image file is required" });
    }

    const { cameraId, lat, lng, tiles } = req.body;
    const sighting = await processFrame({
      buffer: req.file.buffer,
      cameraId,
      location: { lat: lat ?? null, lng: lng ?? null },
      // Multipart form fields arrive as strings, so compare rather than coerce —
      // Boolean("false") is true.
      tiles: tiles === "true" || tiles === true,
    });

    res.status(201).json({ success: true, sighting });
  } catch (err) {
    const status = err.message.startsWith("Missing Cloudinary env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// Live-preview detection for a device (webcam) tile. Ordinary frames are
// preview-only — nothing is uploaded or persisted, because this runs on a
// 1.5s loop and storing every frame would flood storage and the sightings log.
//
// A stolen-plate match is the exception. Whichever camera sees it, the owner
// has to be told immediately, so that frame *is* kept: it becomes a real
// sighting (the image is the evidence of where and when) and alerts the owner
// and admins. The cooldown in alertCooldownPassed keeps a plate parked in view
// from re-alerting every tick.
export const detectPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "An image file is required" });
    }

    const tiles = req.body?.tiles === "true";
    const read = await analyzeFrame(req.file.buffer, { tiles });

    const normalized = normalizePlate(read.text);
    const matchedVehicle = normalized ? await Vehicle.findOne({ normalizedPlate: normalized }) : null;
    const matchedStolen = matchedVehicle?.status === "stolen";

    const cameraId = req.body?.cameraId || "device-camera";
    const lat = req.body?.lat ? Number(req.body.lat) : null;
    const lng = req.body?.lng ? Number(req.body.lng) : null;

    let sightingId = null;
    if (matchedStolen && alertCooldownPassed(matchedVehicle._id, cameraId)) {
      const imageUrl = await uploadImage(req.file.buffer, "cctv-sightings");
      const sighting = await CameraSighting.create({
        imageUrl,
        recognizedPlateText: read.text,
        normalizedPlateText: normalized,
        confidence: read.textConfidence,
        plateDetected: read.detected,
        plateDetectionConfidence: read.box?.confidence ?? 0,
        matchedVehicle: matchedVehicle._id,
        matchedStolen: true,
        cameraId,
        location: { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null },
      });
      await alertStolenSighting(sighting);
      sightingId = sighting._id;
    }

    // The overlay draws a box, so a full-frame fallback read has nothing to
    // show even when it produced text — only a localized plate is previewable.
    if (!read.detected) {
      return res.json({ success: true, detected: false });
    }

    res.json({
      success: true,
      detected: true,
      box: read.box,
      text: read.text,
      textConfidence: read.textConfidence,
      frame: read.frame,
      match: matchedVehicle
        ? { plateNumber: matchedVehicle.plateNumber, stolen: matchedStolen, sightingId }
        : null,
    });
  } catch (err) {
    res.status(anprErrorStatus(err)).json({ success: false, message: anprErrorMessage(err) });
  }
};

const anprErrorStatus = (err) => (err.code === "ECONNREFUSED" ? 503 : 500);
const anprErrorMessage = (err) =>
  err.code === "ECONNREFUSED"
    ? "ANPR service isn't running (see vite-project/anpr_service)"
    : err.message;

// Live-preview detection for a *remote* camera tile. The browser can't do this
// itself: reading pixels out of a cross-origin MJPEG stream taints the canvas,
// and phone camera apps (DroidCam and friends) don't send CORS headers. So the
// server fetches the frame — exactly as the poller already does — and returns
// just the geometry and text. The browser draws the box on top of its <img>
// without ever reading it, which CORS permits.
//
// Unlike the device-camera preview above this one does match plates, because a
// stolen vehicle sitting in front of a camera is precisely what must not wait
// for someone to click "Capture & Scan". A match is persisted as a real
// sighting and alerts the owner; everything else stays preview-only so a 1.5s
// polling loop doesn't fill storage with empty frames.
export const detectCameraPreview = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id);
    if (!camera) {
      return res.status(404).json({ success: false, message: "Camera not found" });
    }
    if (camera.sourceType !== "remote" || !camera.streamUrl) {
      return res.status(400).json({ success: false, message: "That camera has no remote stream to read" });
    }

    const buffer = await fetchFrame(camera.streamUrl);
    const read = await analyzeFrame(buffer, { tiles: camera.tiledScan });

    const normalized = normalizePlate(read.text);
    const matchedVehicle = normalized ? await Vehicle.findOne({ normalizedPlate: normalized }) : null;
    const matchedStolen = matchedVehicle?.status === "stolen";

    let sightingId = null;
    if (matchedStolen && alertCooldownPassed(matchedVehicle._id, camera.label)) {
      const imageUrl = await uploadImage(buffer, "cctv-sightings");
      const sighting = await CameraSighting.create({
        imageUrl,
        recognizedPlateText: read.text,
        normalizedPlateText: normalized,
        confidence: read.textConfidence,
        plateDetected: read.detected,
        plateDetectionConfidence: read.box?.confidence ?? 0,
        matchedVehicle: matchedVehicle._id,
        matchedStolen: true,
        cameraId: camera.label,
        location: camera.location,
      });
      await alertStolenSighting(sighting);
      sightingId = sighting._id;
    }

    res.json({
      success: true,
      detected: read.detected,
      box: read.box,
      text: read.text,
      textConfidence: read.textConfidence,
      frame: read.frame,
      match: matchedVehicle
        ? { plateNumber: matchedVehicle.plateNumber, stolen: matchedStolen, sightingId }
        : null,
    });
  } catch (err) {
    res.status(anprErrorStatus(err)).json({ success: false, message: anprErrorMessage(err) });
  }
};

// Every unanswered stolen-vehicle detection of *this user's* vehicles. The
// socket alert only reaches an owner who happened to be online at the moment
// of detection, so the overlay calls this on load and shows anything missed.
export const listMyTheftAlerts = async (req, res) => {
  try {
    const myVehicles = await Vehicle.find({ owner: req.user._id }).select("_id");
    if (myVehicles.length === 0) return res.json({ success: true, sightings: [] });

    const sightings = await CameraSighting.find({
      matchedVehicle: { $in: myVehicles.map((v) => v._id) },
      matchedStolen: true,
      // Sightings recorded before ownerResponse existed have no such field at
      // all, and Mongo won't match those on a plain equality check — they are
      // unanswered just the same.
      $or: [{ ownerResponse: "pending" }, { ownerResponse: { $exists: false } }],
    })
      .populate("matchedVehicle", "plateNumber make model color vehicleType images owner")
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ success: true, sightings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// The owner answers "is this really your stolen vehicle?". Either way an entry
// lands in the admin SOS queue — a confirmation is an emergency to act on, and
// a rejection still means a stolen-flagged plate was seen and wants review.
// All the evidence is read back off the sighting server-side, so the client
// can't point a confirmation at a vehicle that isn't theirs.
export const respondToTheftAlert = async (req, res) => {
  try {
    const { confirmed, lat, lng } = req.body;
    if (typeof confirmed !== "boolean") {
      return res.status(400).json({ success: false, message: "confirmed must be true or false" });
    }

    const sighting = await CameraSighting.findById(req.params.id).populate("matchedVehicle");
    if (!sighting) return res.status(404).json({ success: false, message: "Sighting not found" });
    if (!sighting.matchedVehicle?.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "That sighting isn't of your vehicle" });
    }
    if (sighting.ownerResponse !== "pending") {
      return res.status(409).json({ success: false, message: "You've already responded to this detection" });
    }

    sighting.ownerResponse = confirmed ? "confirmed" : "rejected";
    sighting.ownerRespondedAt = new Date();
    await sighting.save();

    const vehicle = sighting.matchedVehicle;
    const alert = await SOSAlert.create({
      user: req.user._id,
      // Fall back to where the camera saw it when the browser won't share a
      // location — an alert with the wrong coordinates would be worse than one
      // pointing at the camera.
      location: {
        lat: Number.isFinite(lat) ? lat : sighting.location?.lat ?? 0,
        lng: Number.isFinite(lng) ? lng : sighting.location?.lng ?? 0,
      },
      message: confirmed
        ? `Track that vehicle — confirmed its real stolen one (${vehicle.plateNumber})`
        : `Owner did not confirm the detection of ${vehicle.plateNumber}`,
      kind: "theft",
      ownerConfirmation: confirmed ? "confirmed" : "not-confirmed",
      status: confirmed ? "active" : "pending",
      vehicle: vehicle._id,
      sighting: sighting._id,
      plateImageUrl: sighting.imageUrl,
      vehicleImageUrl: vehicle.images?.[0] ?? "",
      ownerPlateImageUrl: vehicle.plateImageUrl ?? "",
      cameraId: sighting.cameraId,
      sightingLocation: sighting.location,
    });

    const populated = await alert.populate([
      { path: "user", select: "firstname lastname email" },
      { path: "vehicle", select: "plateNumber make model color vehicleType" },
    ]);
    getIO().to("admins").emit("sos:new", populated);

    res.status(201).json({ success: true, alert: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listSightings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.matchedStolen === "true") filter.matchedStolen = true;

    const sightings = await CameraSighting.find(filter)
      .populate("matchedVehicle", "plateNumber make model owner")
      .sort({ createdAt: -1 });
    res.json({ success: true, sightings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
