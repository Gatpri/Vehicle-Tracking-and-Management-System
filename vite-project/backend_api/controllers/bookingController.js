import ServiceRequest from "../models/ServiceRequest.js";
import Vehicle from "../models/Vehicle.js";
import Workshop from "../models/Workshop.js";
import { checkOverpricing } from "../services/pricingService.js";
import { hasPermission } from "../policies/permissions.js";
import { getIO } from "../config/socket.js";

const canReadAny = (user) => hasPermission(user.role, "booking:read:any", user.permissions);

// A plain admin can only manage bookings for workshops they themselves
// manage; superadmin (and, incidentally, a booking's owning workshop having
// no manager at all) is unrestricted.
const canManageBooking = async (user, workshopId) => {
  if (user.role === "superadmin") return true;
  const workshop = await Workshop.findById(workshopId);
  return !!workshop?.managedBy?.equals(user._id);
};

export const createBooking = async (req, res) => {
  try {
    const { vehicleId, workshopId, serviceType, description, scheduledAt } = req.body;
    if (!vehicleId || !workshopId || !serviceType) {
      return res.status(400).json({ success: false, message: "vehicleId, workshopId, and serviceType are required" });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle || !vehicle.owner.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Vehicle not found or not yours" });
    }

    const workshop = await Workshop.findById(workshopId);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

    const booking = await ServiceRequest.create({
      user: req.user._id,
      vehicle: vehicleId,
      workshop: workshopId,
      serviceType,
      description,
      scheduledAt,
    });
    res.status(201).json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyBookings = async (req, res) => {
  try {
    const { status, vehicleId } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (vehicleId) filter.vehicle = vehicleId;

    const bookings = await ServiceRequest.find(filter)
      .populate("vehicle", "plateNumber make model")
      .populate("workshop", "name location")
      .sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listBookings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    if (req.user.role === "admin") {
      const managedWorkshops = await Workshop.find({ managedBy: req.user._id }).select("_id");
      filter.workshop = { $in: managedWorkshops.map((w) => w._id) };
    }

    const bookings = await ServiceRequest.find(filter)
      .populate("vehicle", "plateNumber make model")
      .populate("workshop", "name")
      .populate("user", "firstname lastname email")
      .sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id)
      .populate("vehicle", "plateNumber make model")
      .populate("workshop", "name managedBy");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    const isOwner = booking.user.equals(req.user._id);
    const managed = await canManageBooking(req.user, booking.workshop._id);
    if (!isOwner && !managed && !canReadAny(req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const acceptBooking = async (req, res) => {
  try {
    const { quotedPrice } = req.body;
    if (typeof quotedPrice !== "number" || quotedPrice <= 0) {
      return res.status(400).json({ success: false, message: "quotedPrice must be a positive number" });
    }

    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!(await canManageBooking(req.user, booking.workshop))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (booking.status !== "pending") {
      return res.status(400).json({ success: false, message: `Cannot accept a booking in status "${booking.status}"` });
    }

    const { isOverpriced, overpriceRatio } = await checkOverpricing(booking.serviceType, quotedPrice);

    booking.status = "accepted";
    booking.quotedPrice = quotedPrice;
    booking.isOverpriced = isOverpriced;
    booking.overpriceRatio = overpriceRatio;
    await booking.save();

    getIO().to(`user:${booking.user}`).emit("booking:updated", booking);
    if (isOverpriced) getIO().to("admins").emit("booking:overpriced", booking);

    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const startBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!(await canManageBooking(req.user, booking.workshop))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (booking.status !== "accepted") {
      return res.status(400).json({ success: false, message: `Cannot start a booking in status "${booking.status}"` });
    }

    booking.status = "in_progress";
    await booking.save();
    getIO().to(`user:${booking.user}`).emit("booking:updated", booking);
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const completeBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!(await canManageBooking(req.user, booking.workshop))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (booking.status !== "in_progress") {
      return res.status(400).json({ success: false, message: `Cannot complete a booking in status "${booking.status}"` });
    }

    booking.status = "completed";
    booking.finalPrice = req.body?.finalPrice ?? booking.quotedPrice;
    await booking.save();
    getIO().to(`user:${booking.user}`).emit("booking:updated", booking);
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    const isOwner = booking.user.equals(req.user._id);
    const managed = await canManageBooking(req.user, booking.workshop);
    if (!isOwner && !managed) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (isOwner && !managed && booking.status !== "pending") {
      return res.status(400).json({ success: false, message: "You can only cancel a booking while it's still pending" });
    }

    booking.status = "cancelled";
    await booking.save();
    getIO().to(`user:${booking.user}`).emit("booking:updated", booking);
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
