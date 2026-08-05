import Camera from "../models/Camera.js";

export const listCameras = async (req, res) => {
  try {
    const cameras = await Camera.find().sort({ createdAt: -1 });
    res.json({ success: true, cameras });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createCamera = async (req, res) => {
  try {
    const { label, sourceType, streamUrl, lat, lng, pollIntervalSec, tiledScan } = req.body;
    if (!label) {
      return res.status(400).json({ success: false, message: "label is required" });
    }
    const type = sourceType === "device" ? "device" : "remote";
    if (type === "remote" && !streamUrl) {
      return res.status(400).json({ success: false, message: "streamUrl is required for a remote camera" });
    }

    const existing = await Camera.findOne({ label });
    if (existing) {
      return res.status(409).json({ success: false, message: "A camera with that label already exists" });
    }

    const camera = await Camera.create({
      label,
      sourceType: type,
      streamUrl: streamUrl || "",
      location: { lat: lat ?? null, lng: lng ?? null },
      tiledScan: Boolean(tiledScan),
      pollIntervalSec: pollIntervalSec || 15,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateCamera = async (req, res) => {
  try {
    const { active, pollIntervalSec, streamUrl, lat, lng, tiledScan } = req.body;
    const camera = await Camera.findById(req.params.id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });

    if (typeof active === "boolean") camera.active = active;
    if (typeof tiledScan === "boolean") camera.tiledScan = tiledScan;
    if (pollIntervalSec) camera.pollIntervalSec = pollIntervalSec;
    if (streamUrl !== undefined) camera.streamUrl = streamUrl;
    if (lat !== undefined) camera.location.lat = lat;
    if (lng !== undefined) camera.location.lng = lng;

    await camera.save();
    res.json({ success: true, camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteCamera = async (req, res) => {
  try {
    const camera = await Camera.findByIdAndDelete(req.params.id);
    if (!camera) return res.status(404).json({ success: false, message: "Camera not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
