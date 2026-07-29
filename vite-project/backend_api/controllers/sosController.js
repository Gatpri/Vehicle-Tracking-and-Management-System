import SOSAlert from "../models/SOSAlert.js";
import { getIO } from "../config/socket.js";

export const createAlert = async (req, res) => {
  try {
    const { lat, lng, message } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, message: "lat and lng are required numbers" });
    }

    const alert = await SOSAlert.create({ user: req.user._id, location: { lat, lng }, message });
    getIO().to("admins").emit("sos:new", alert);
    res.status(201).json({ success: true, alert });
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
