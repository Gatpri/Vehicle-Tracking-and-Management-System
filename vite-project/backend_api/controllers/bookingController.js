import ServiceRequest from "../models/ServiceRequest.js";
import Vehicle from "../models/Vehicle.js";
import Workshop from "../models/Workshop.js";
import PartsQuote from "../models/PartsQuote.js";
import Transaction from "../models/Transaction.js";
import { hasPermission, isWorkshopScoped } from "../policies/permissions.js";
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
    const { vehicleId, workshopId, serviceType, description, scheduledAt, pickupLocation, deliveryRequested } = req.body;
    if (!vehicleId || !workshopId || !serviceType) {
      return res.status(400).json({ success: false, message: "vehicleId, workshopId, and serviceType are required" });
    }
    const wantsDelivery = deliveryRequested === true;
    if (wantsDelivery && (typeof pickupLocation?.lat !== "number" || typeof pickupLocation?.lng !== "number")) {
      return res.status(400).json({ success: false, message: "pickupLocation with lat and lng is required when requesting delivery" });
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
      deliveryRequested: wantsDelivery,
      ...(wantsDelivery && {
        pickupLocation: {
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          address: pickupLocation.address || "",
        },
      }),
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

    // deliveryFee is a plain field directly on the booking (the one combined
    // round-trip fee, if a delivery leg was assigned) — no join needed.
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

    // Both admin and workshop-admin only ever see bookings for garages they
    // manage; superadmin sees everything.
    if (isWorkshopScoped(req.user.role)) {
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

// The full maintenance record for one vehicle: every completed job, what was
// actually replaced (the accepted quote's selected lines), what it cost, and
// how long it had been since the previous visit. Owner-only.
export const getVehicleServiceHistory = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.vehicleId);
    if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
    if (!vehicle.owner.equals(req.user._id) && !canReadAny(req.user)) {
      return res.status(403).json({ success: false, message: "Not your vehicle" });
    }

    const bookings = await ServiceRequest.find({ vehicle: vehicle._id, status: "completed" })
      .populate("workshop", "name address logoUrl")
      .sort({ updatedAt: -1 });

    const quotes = await PartsQuote.find({
      serviceRequest: { $in: bookings.map((b) => b._id) },
      status: "accepted",
    });
    const quoteByRequest = new Map(quotes.map((q) => [String(q.serviceRequest), q]));

    // Oldest-first pass to work out the gap between visits, then flipped back
    // so the response reads newest-first like every other list here.
    const chronological = [...bookings].reverse();
    const entries = chronological.map((booking, index) => {
      const quote = quoteByRequest.get(String(booking._id));
      const latest = quote?.revisions?.[quote.revisions.length - 1];
      const partsReplaced = (latest?.items ?? []).filter((i) => i.selected);
      const previous = chronological[index - 1];

      return {
        _id: booking._id,
        serviceType: booking.serviceType,
        description: booking.description,
        workshop: booking.workshop,
        completedAt: booking.updatedAt,
        finalPrice: booking.finalPrice ?? booking.quotedPrice ?? null,
        partsReplaced: partsReplaced.map((p) => ({ part: p.part, price: p.price })),
        partsTotal: partsReplaced.reduce((sum, p) => sum + p.price, 0),
        daysSincePrevious: previous
          ? Math.round((booking.updatedAt - previous.updatedAt) / (1000 * 60 * 60 * 24))
          : null,
      };
    });

    res.json({
      success: true,
      vehicle: {
        _id: vehicle._id,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
      },
      history: entries.reverse(),
      summary: {
        totalServices: entries.length,
        totalSpent: entries.reduce((sum, e) => sum + (e.finalPrice ?? 0), 0),
        lastServicedAt: entries[0]?.completedAt ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Which payment settled a booking, if any.
//
// Attribution is by booking id, never by matching an amount: two customers
// each owing Rs 20 produce two payment entries of Rs 20, and the only thing
// distinguishing them is which booking each transaction points at. Every
// payment path — wallet and eSewa — records that link when it settles, so
// "who paid" is never inferred.
export const getBookingPayment = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id).select("user workshop paymentStatus finalPrice quotedPrice status");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    const isOwner = booking.user.equals(req.user._id);
    if (!isOwner && !canReadAny(req.user) && !(await canManageBooking(req.user, booking.workshop))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const payment = await Transaction.findOne({
      relatedBooking: booking._id,
      type: "payment",
      status: "success",
    })
      .populate("user", "firstname lastname email")
      .lean();

    res.json({
      success: true,
      // "pending" reads better than "unpaid" once a job is finished and the
      // customer simply hasn't settled yet.
      paymentStatus: booking.paymentStatus === "unpaid" && booking.status === "completed"
        ? "pending"
        : booking.paymentStatus,
      amountDue: booking.finalPrice ?? booking.quotedPrice ?? null,
      paidBy: payment?.user ?? null,
      paidAt: payment?.createdAt ?? null,
      paidVia: payment?.gateway ?? null,
      transactionId: payment?._id ?? null,
    });
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

// No price is entered here anymore — a real number only exists once the
// workshop sends and the customer accepts a parts-quote round (see
// confirmQuote in quoteController.js, which sets finalPrice and runs the
// overpricing check once there's an actual figure to check).
export const acceptBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!(await canManageBooking(req.user, booking.workshop))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (booking.status !== "pending") {
      return res.status(400).json({ success: false, message: `Cannot accept a booking in status "${booking.status}"` });
    }

    booking.status = "accepted";
    await booking.save();

    getIO().to(`user:${booking.user}`).emit("booking:updated", booking);

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
    // Preserves whatever confirmQuote already wrote, allows a manual override
    // in the body, and falls back to 0 (never null/undefined) for a booking
    // that never had any parts quoted — keeps downstream payment math safe.
    booking.finalPrice = req.body?.finalPrice ?? booking.finalPrice ?? 0;
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

// The customer's opt-in for return delivery — separate from and never
// implied by deliveryRequested (pickup). Only marks intent; a fee/charge
// only exists once admin/delivery-admin actually assigns a return-leg
// delivery-staff (assignDelivery, deliveryController.js), which is itself
// gated on this flag being set first.
export const requestReturnDelivery = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    if (!booking.user.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!(booking.status === "completed" && booking.paymentStatus === "paid")) {
      return res.status(400).json({ success: false, message: "Booking must be completed and paid first" });
    }
    if (booking.returnDeliveryRequested) {
      return res.status(400).json({ success: false, message: "Return delivery already requested" });
    }

    booking.returnDeliveryRequested = true;
    await booking.save();

    getIO().to("admins").emit("booking:return-delivery-requested", booking);
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
