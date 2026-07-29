import TheftReport from "../models/TheftReport.js";
import Vehicle from "../models/Vehicle.js";
import { getIO } from "../config/socket.js";

export const createReport = async (req, res) => {
  try {
    const { vehicleId, lat, lng, description } = req.body;
    if (!vehicleId || typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, message: "vehicleId, lat, and lng are required" });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle || !vehicle.owner.equals(req.user._id)) {
      return res.status(404).json({ success: false, message: "Vehicle not found or not yours" });
    }

    const report = await TheftReport.create({
      vehicle: vehicleId,
      reportedBy: req.user._id,
      location: { lat, lng },
      description,
    });

    vehicle.status = "stolen";
    await vehicle.save();

    getIO().to("admins").emit("theft:new", report);
    res.status(201).json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyReports = async (req, res) => {
  try {
    const reports = await TheftReport.find({ reportedBy: req.user._id })
      .populate("vehicle", "plateNumber make model")
      .sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Public, unauthenticated — stripped down to just what a map needs, no
// reporter/vehicle identity, so this is safe to expose without a login.
export const getHeatmap = async (req, res) => {
  try {
    const reports = await TheftReport.find({ status: "open" }).select("location createdAt status -_id");
    res.json({ success: true, points: reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listReports = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const reports = await TheftReport.find(filter)
      .populate("vehicle", "plateNumber make model")
      .populate("reportedBy", "firstname lastname email")
      .sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateReport = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["open", "recovered", "closed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const report = await TheftReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    report.status = status;
    await report.save();

    if (status === "recovered") {
      await Vehicle.findByIdAndUpdate(report.vehicle, { status: "active" });
    }

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
