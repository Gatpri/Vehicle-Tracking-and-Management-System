import Vehicle from "../models/Vehicle.js";
import CameraSighting from "../models/CameraSighting.js";
import { uploadImage } from "../services/cloudinaryService.js";
import { recognizeText } from "../services/ocrService.js";
import { normalizePlate } from "../utils/plateMatch.js";
import { getIO } from "../config/socket.js";

// Stands in for "a camera captured this frame" — no physical CCTV hardware
// is wired up, so a REST upload plays that role. Runs real OCR (Tesseract)
// and a real match against registered plates; only the camera itself is simulated.
export const scanImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "An image file is required" });
    }

    const { cameraId, lat, lng } = req.body;

    const [imageUrl, { text, confidence }] = await Promise.all([
      uploadImage(req.file.buffer, "cctv-sightings"),
      recognizeText(req.file.buffer),
    ]);

    const normalized = normalizePlate(text);
    const matchedVehicle = normalized
      ? await Vehicle.findOne({ plateNumber: normalized })
      : null;
    const matchedStolen = matchedVehicle?.status === "stolen";

    const sighting = await CameraSighting.create({
      imageUrl,
      recognizedPlateText: text,
      normalizedPlateText: normalized,
      confidence,
      matchedVehicle: matchedVehicle?._id ?? null,
      matchedStolen,
      cameraId: cameraId || "manual-upload",
      location: { lat: lat ?? null, lng: lng ?? null },
    });

    if (matchedStolen) {
      getIO().to("admins").emit("theft:sighting", sighting);
      getIO().to(`user:${matchedVehicle.owner}`).emit("theft:sighting", sighting);
    }

    res.status(201).json({ success: true, sighting });
  } catch (err) {
    const status = err.message.startsWith("Missing Cloudinary env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
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
