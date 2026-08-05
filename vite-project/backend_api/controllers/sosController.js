import SOSAlert from "../models/SOSAlert.js";
import CameraSighting from "../models/CameraSighting.js";
import { getIO } from "../config/socket.js";

export const createAlert = async (req, res) => {
  try {
    const { lat, lng, message, sightingId } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, message: "lat and lng are required numbers" });
    }

    const evidence = {};
    // Raised from the breaking-alert overlay: the owner has confirmed the
    // vehicle a camera spotted is theirs. Every field is read back from the
    // sighting server-side — a client that could name its own plate photo or
    // vehicle could fabricate an alert against someone else's car.
    if (sightingId) {
      const sighting = await CameraSighting.findById(sightingId).populate("matchedVehicle");
      if (!sighting) {
        return res.status(404).json({ success: false, message: "Sighting not found" });
      }
      if (!sighting.matchedVehicle?.owner.equals(req.user._id)) {
        return res.status(403).json({ success: false, message: "That sighting isn't of your vehicle" });
      }
      evidence.kind = "theft";
      evidence.vehicle = sighting.matchedVehicle._id;
      evidence.sighting = sighting._id;
      evidence.plateImageUrl = sighting.imageUrl;
      evidence.vehicleImageUrl = sighting.matchedVehicle.images?.[0] ?? "";
      evidence.ownerPlateImageUrl = sighting.matchedVehicle.plateImageUrl ?? "";
      evidence.cameraId = sighting.cameraId;
      evidence.sightingLocation = sighting.location;
    }

    const alert = await SOSAlert.create({
      user: req.user._id,
      location: { lat, lng },
      message,
      ...evidence,
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

export const listMyAlerts = async (req, res) => {
  try {
    const alerts = await SOSAlert.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const alerts = await SOSAlert.find(filter)
      .populate("user", "firstname lastname email")
      .populate("vehicle", "plateNumber make model color vehicleType")
      .sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const alert = await SOSAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    if (alert.status === "resolved") {
      return res.status(400).json({ success: false, message: "Alert already resolved" });
    }

    alert.status = "resolved";
    alert.resolvedBy = req.user._id;
    alert.resolvedAt = new Date();
    await alert.save();

    getIO().to(`user:${alert.user}`).emit("sos:resolved", alert);
    getIO().to("admins").emit("sos:resolved", alert);
    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
