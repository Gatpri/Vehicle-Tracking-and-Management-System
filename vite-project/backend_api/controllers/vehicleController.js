import Vehicle from "../models/Vehicle.js";
import { uploadImage } from "../services/cloudinaryService.js";
import { normalizePlate } from "../utils/plateMatch.js";
import { hasPermission } from "../policies/permissions.js";

const canReadAny = (user) => hasPermission(user.role, "vehicle:read:any", user.permissions);
const canDeleteAny = (user) => hasPermission(user.role, "vehicle:delete:any", user.permissions);

export const registerVehicle = async (req, res) => {
  try {
    const { plateNumber, make, model, year, color, vehicleType, images } = req.body;
    if (!plateNumber || !make || !model) {
      return res.status(400).json({ success: false, message: "plateNumber, make, and model are required" });
    }

    // Compare on the normalized form so "GA 19 PA 4630" and "ga19pa4630" are
    // recognised as the same plate rather than registered twice — a duplicate
    // would make camera matches ambiguous.
    const existing = await Vehicle.findOne({ normalizedPlate: normalizePlate(plateNumber) });
    if (existing) {
      return res.status(400).json({ success: false, message: "A vehicle with this plate number already exists" });
    }

    const vehicle = await Vehicle.create({
      owner: req.user._id,
      plateNumber,
      make,
      model,
      year,
      color,
      vehicleType,
      images,
    });
    res.status(201).json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listVehicles = async (req, res) => {
  try {
    const { status, plateNumber } = req.query;
    const filter = {};
    if (status) filter.status = status;
    // Search on the normalized form so an admin finds the vehicle whether or
    // not they type the plate's spacing the way the owner did.
    if (plateNumber) filter.normalizedPlate = normalizePlate(plateNumber);

    const vehicles = await Vehicle.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

    const isOwner = vehicle.owner.equals(req.user._id);
    if (!isOwner && !canReadAny(req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!vehicle.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const { make, model, year, color, vehicleType, images } = req.body;
    Object.assign(vehicle, {
      ...(make !== undefined && { make }),
      ...(model !== undefined && { model }),
      ...(year !== undefined && { year }),
      ...(color !== undefined && { color }),
      ...(vehicleType !== undefined && { vehicleType }),
      ...(images !== undefined && { images }),
    });
    await vehicle.save();
    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

    const isOwner = vehicle.owner.equals(req.user._id);
    if (!isOwner && !canDeleteAny(req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await vehicle.deleteOne();
    res.json({ success: true, message: "Vehicle deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Owners upload the evidence that makes a theft actionable: photos of the
// vehicle, and a close-up of its number plate. The plate shot is what an admin
// compares a camera's read against, and the vehicle shot is what the owner is
// shown beside the camera frame when deciding whether a sighting is really
// theirs — so both are stored on the vehicle, not on a report.
//
// `kind` selects which: "plate" replaces the single plate photo, anything else
// appends to the vehicle gallery.
export const uploadVehiclePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "An image file is required" });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!vehicle.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const url = await uploadImage(req.file.buffer, "vehicle-photos");
    if (req.body.kind === "plate") vehicle.plateImageUrl = url;
    else vehicle.images.push(url);
    await vehicle.save();

    res.status(201).json({ success: true, vehicle });
  } catch (err) {
    const status = err.message.startsWith("Missing Cloudinary env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

export const deleteVehiclePhoto = async (req, res) => {
  try {
    const { url, kind } = req.body;
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!vehicle.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (kind === "plate") vehicle.plateImageUrl = "";
    else vehicle.images = vehicle.images.filter((i) => i !== url);
    await vehicle.save();

    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const flagVehicle = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "stolen", "inactive"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, { status }, { returnDocument: "after" });
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

    res.json({ success: true, vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
