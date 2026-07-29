import Vehicle from "../models/Vehicle.js";
import LocationHistory from "../models/LocationHistory.js";
import { hasPermission } from "../policies/permissions.js";
import { getIO } from "../config/socket.js";

const canReadAny = (user) => hasPermission(user.role, "tracking:read:any", user.permissions);

const assertVehicleAccess = async (req, vehicleId, ownerOnly = false) => {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return { vehicle: null, allowed: false };

  const isOwner = vehicle.owner.equals(req.user._id);
  const allowed = ownerOnly ? isOwner : isOwner || canReadAny(req.user);
  return { vehicle, allowed };
};

// REST fallback for clients that aren't using the socket "tracking:push"
// event — persists a point the same way, and broadcasts to the same room,
// so both paths stay in sync for anyone subscribed live.
export const recordLocation = async (req, res) => {
  try {
    const { lat, lng, speed } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ success: false, message: "lat and lng are required numbers" });
    }

    const { vehicle, allowed } = await assertVehicleAccess(req, req.params.vehicleId, true);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!allowed) return res.status(403).json({ success: false, message: "Forbidden" });

    const point = await LocationHistory.create({ vehicle: vehicle._id, lat, lng, speed, source: "manual" });
    getIO().to(`vehicle:${vehicle._id}`).emit("tracking:update", point);
    res.status(201).json({ success: true, point });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLocationHistory = async (req, res) => {
  try {
    const { vehicle, allowed } = await assertVehicleAccess(req, req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!allowed) return res.status(403).json({ success: false, message: "Forbidden" });

    const { from, to, limit = 200 } = req.query;
    const filter = { vehicle: vehicle._id };
    if (from || to) {
      filter.recordedAt = {};
      if (from) filter.recordedAt.$gte = new Date(from);
      if (to) filter.recordedAt.$lte = new Date(to);
    }

    const history = await LocationHistory.find(filter)
      .sort({ recordedAt: -1 })
      .limit(Math.min(Number(limit), 1000));
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLatestLocation = async (req, res) => {
  try {
    const { vehicle, allowed } = await assertVehicleAccess(req, req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!allowed) return res.status(403).json({ success: false, message: "Forbidden" });

    const latest = await LocationHistory.findOne({ vehicle: vehicle._id }).sort({ recordedAt: -1 });
    res.json({ success: true, latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
