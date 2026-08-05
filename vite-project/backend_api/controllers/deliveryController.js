import Delivery from "../models/Delivery.js";
import ServiceRequest from "../models/ServiceRequest.js";
import Workshop from "../models/Workshop.js";
import User from "../models/User.js";
import DeliveryLocationHistory from "../models/DeliveryLocationHistory.js";
import { canManageDeliveries, canReadAnyDelivery, canViewDelivery } from "../policies/deliveryAccess.js";
import { getIO } from "../config/socket.js";
import { notify } from "../services/notificationService.js";
import { deliveryFeeFor, distanceForDelivery } from "../services/deliveryPricingService.js";
import { settleDeliveryFee } from "../services/ledgerService.js";

const PICKUP_LEG_TRANSITIONS = {
  assigned: ["en_route_to_pickup"],
  en_route_to_pickup: ["picked_up"],
  picked_up: ["en_route_to_workshop"],
  en_route_to_workshop: ["at_workshop"],
};
const RETURN_LEG_TRANSITIONS = {
  assigned: ["en_route_to_dropoff"],
  en_route_to_dropoff: ["delivered"],
};
// Every status where the staff is actually driving somewhere and location
// pushes/tracking should be live. "en_route_to_workshop" (picked_up -> at
// the shop, still part of the pickup leg) was originally missing here, which
// silently blocked location pushes and the map for that whole phase of the
// trip — this list must stay in sync with the leg transition maps above.
const EN_ROUTE_STATUSES = ["en_route_to_pickup", "en_route_to_workshop", "en_route_to_dropoff"];

const transitionsFor = (leg) => (leg === "pickup" ? PICKUP_LEG_TRANSITIONS : RETURN_LEG_TRANSITIONS);

// Bookings ready for a pickup-leg or return-leg assignment: accepted bookings
// that requested pickup delivery with no pickup Delivery yet, and
// completed+paid bookings that separately requested return delivery with no
// return Delivery yet. The two requests are independent flags — a customer
// who self-picked-up can still request return delivery, and vice versa — so
// the query can't filter on one shared "wants delivery" flag; it must accept
// either request and let the per-candidate leg logic below decide which leg
// (if any) that particular booking is actually ready for. Optionally
// filtered by the workshop's area/region; delivery-admin's region is always
// server-enforced.
export const listAssignableBookings = async (req, res) => {
  try {
    const { area } = req.query;
    let { region } = req.query;
    if (req.user.role === "delivery-admin") region = req.user.region;

    const workshopFilter = {};
    if (area) workshopFilter.area = area;
    if (region) workshopFilter.region = region;
    const workshops = await Workshop.find(workshopFilter).select("_id name area region location");
    const workshopIds = workshops.map((w) => w._id);
    const workshopById = new Map(workshops.map((w) => [String(w._id), w]));

    const candidates = await ServiceRequest.find({
      workshop: { $in: workshopIds },
      $or: [
        { status: "accepted", deliveryRequested: true },
        { status: "completed", paymentStatus: "paid", returnDeliveryRequested: true },
      ],
    })
      .populate("vehicle", "plateNumber make model")
      .populate("user", "firstname lastname email")
      .sort({ createdAt: -1 });

    const existing = await Delivery.find({ booking: { $in: candidates.map((c) => c._id) } }).select("booking leg");
    const existingLegs = new Map();
    existing.forEach((d) => {
      const key = String(d.booking);
      if (!existingLegs.has(key)) existingLegs.set(key, new Set());
      existingLegs.get(key).add(d.leg);
    });

    const assignable = candidates
      .map((booking) => {
        const legs = existingLegs.get(String(booking._id)) || new Set();
        let leg = null;
        if (booking.status === "accepted" && booking.deliveryRequested && !legs.has("pickup")) leg = "pickup";
        else if (
          booking.status === "completed" &&
          booking.paymentStatus === "paid" &&
          booking.returnDeliveryRequested &&
          !legs.has("return")
        ) leg = "return";
        if (!leg) return null;
        return {
          booking,
          leg,
          workshop: workshopById.get(String(booking.workshop)),
        };
      })
      .filter(Boolean);

    res.json({ success: true, assignable });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listStaffByArea = async (req, res) => {
  try {
    const { area } = req.query;
    let { region } = req.query;
    if (req.user.role === "delivery-admin") region = req.user.region;

    const filter = { role: "delivery-staff" };
    if (area) filter.area = area;
    if (region) filter.region = region;
    const staff = await User.find(filter).select("firstname lastname email area region");
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const assignDelivery = async (req, res) => {
  try {
    const { bookingId, leg, staffId } = req.body;
    if (!bookingId || !["pickup", "return"].includes(leg) || !staffId) {
      return res.status(400).json({ success: false, message: "bookingId, leg (pickup|return), and staffId are required" });
    }

    const booking = await ServiceRequest.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    if (leg === "pickup" && booking.status !== "accepted") {
      return res.status(400).json({ success: false, message: "Booking must be accepted before assigning a pickup" });
    }
    if (
      leg === "return" &&
      !(booking.status === "completed" && booking.paymentStatus === "paid" && booking.returnDeliveryRequested)
    ) {
      return res.status(400).json({
        success: false,
        message: "Booking must be completed, paid, and the customer must have requested return delivery before assigning a return",
      });
    }
    if (!booking.pickupLocation?.lat || !booking.pickupLocation?.lng) {
      // Only ever populated when deliveryRequested was true at booking time
      // — a customer who self-picked-up but later requests return delivery
      // has no drop-off address on file yet. Surfaced as a clear error
      // rather than silently assigning to (0,0); collecting a location
      // retroactively is a follow-up, not solved here.
      return res.status(400).json({ success: false, message: "Booking has no pickup/drop-off location on file" });
    }

    // One staff member does the whole round trip — no split, no complexity.
    // If the sibling leg already has staff, the return leg MUST go to the
    // same person; this is what makes settleDeliveryFee's "always pay the
    // full share to one recipient" safe to assume everywhere else.
    if (leg === "return") {
      const pickupLeg = await Delivery.findOne({ booking: bookingId, leg: "pickup" });
      if (pickupLeg?.staff && String(pickupLeg.staff) !== String(staffId)) {
        return res.status(400).json({
          success: false,
          message: "Return delivery must go to the same staff member who did the pickup",
        });
      }
    }

    const workshop = await Workshop.findById(booking.workshop);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

    // A delivery-admin may only assign within their own region, even though
    // delivery:manage would otherwise let them act on any workshop — the
    // permission grants the capability, this narrows the scope, same
    // discipline as isWorkshopScoped narrows workshop-admin.
    if (req.user.role === "delivery-admin" && workshop.region !== req.user.region) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "delivery-staff") {
      return res.status(400).json({ success: false, message: "Staff member not found or not a delivery-staff account" });
    }
    if (workshop.region && staff.region !== workshop.region) {
      return res.status(400).json({ success: false, message: "Staff member's region does not match the workshop's region" });
    }

    let delivery = await Delivery.findOne({ booking: bookingId, leg });
    if (delivery && !["unassigned", "assigned"].includes(delivery.status)) {
      return res.status(400).json({ success: false, message: `This ${leg} leg is already ${delivery.status}` });
    }

    if (!delivery) {
      delivery = new Delivery({ booking: bookingId, workshop: workshop._id, leg });
    }
    delivery.staff = staff._id;
    delivery.assignedBy = req.user._id;
    delivery.area = workshop.area;
    delivery.status = "assigned";
    delivery.assignedAt = new Date();
    delivery.customerLocation = {
      lat: booking.pickupLocation.lat,
      lng: booking.pickupLocation.lng,
      address: booking.pickupLocation.address || "",
    };
    await delivery.save();

    // One combined round-trip fee on the booking, computed once regardless
    // of which leg is assigned first (self-pickup-then-return bookings
    // reach this via the return leg; every other booking via pickup).
    // Frozen once set, same reasoning as customerLocation — a later
    // reassignment or the sibling leg shouldn't recompute it.
    if (booking.deliveryFee == null) {
      const distanceKm = distanceForDelivery(workshop.location, booking.pickupLocation);
      booking.distanceKm = Number(distanceKm.toFixed(2));
      booking.deliveryFee = deliveryFeeFor(distanceKm);
      await booking.save();
    }

    // Pays out the moment settlement becomes possible on this side: if the
    // booking was already paid before this leg existed (the common return-
    // after-payment case), this is the trigger. If the booking isn't paid
    // yet (this is the pickup leg, assigned before payment), this no-ops —
    // settleBookingPayment will pay it out itself once payment happens.
    await settleDeliveryFee(delivery, booking);

    getIO().to(`user:${booking.user}`).emit("delivery:assigned", delivery);
    getIO().to(`user:${delivery.staff}`).emit("delivery:assigned", delivery);
    await notify({
      user: delivery.staff,
      type: "general",
      title: `New ${leg} assigned`,
      body: `${workshop.name} — booking pickup point ${delivery.customerLocation.address || "on file"}`,
      link: "/staff/deliveries",
      meta: { deliveryId: String(delivery._id) },
    });
    await notify({
      user: booking.user,
      type: "general",
      title: "Delivery staff assigned",
      body: `${staff.firstname} will handle your vehicle ${leg === "pickup" ? "pickup" : "return"}`,
      link: "/bookings",
      meta: { deliveryId: String(delivery._id) },
    });

    res.status(201).json({ success: true, delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const reassignDelivery = async (req, res) => {
  try {
    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ success: false, message: "staffId is required" });

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    if (delivery.status !== "assigned") {
      return res.status(400).json({ success: false, message: "Can only reassign before a leg is under way" });
    }

    // Same round-trip, same staff member — a return leg can't be reassigned
    // away from whoever did the pickup leg (mirrors the check in
    // assignDelivery).
    if (delivery.leg === "return") {
      const pickupLeg = await Delivery.findOne({ booking: delivery.booking, leg: "pickup" });
      if (pickupLeg?.staff && String(pickupLeg.staff) !== String(staffId)) {
        return res.status(400).json({
          success: false,
          message: "Return delivery must go to the same staff member who did the pickup",
        });
      }
    }

    const workshop = await Workshop.findById(delivery.workshop);
    if (req.user.role === "delivery-admin" && workshop?.region !== req.user.region) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "delivery-staff") {
      return res.status(400).json({ success: false, message: "Staff member not found or not a delivery-staff account" });
    }
    if (workshop?.region && staff.region !== workshop.region) {
      return res.status(400).json({ success: false, message: "Staff member's region does not match the workshop's region" });
    }

    delivery.staff = staff._id;
    delivery.assignedBy = req.user._id;
    delivery.assignedAt = new Date();
    await delivery.save();

    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    getIO().to(`user:${booking.user}`).emit("delivery:assigned", delivery);
    getIO().to(`user:${delivery.staff}`).emit("delivery:assigned", delivery);
    await notify({
      user: delivery.staff,
      type: "general",
      title: `New ${delivery.leg} assigned`,
      body: `${workshop?.name ?? "Workshop"} — booking pickup point ${delivery.customerLocation?.address || "on file"}`,
      link: "/staff/deliveries",
      meta: { deliveryId: String(delivery._id) },
    });

    res.json({ success: true, delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listMyDeliveries = async (req, res) => {
  try {
    const filter = { staff: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const deliveries = await Delivery.find(filter)
      .populate({
        path: "booking",
        select: "vehicle serviceType status paymentStatus pickupLocation deliveryFee distanceKm",
        populate: { path: "vehicle", select: "plateNumber make model" },
      })
      .populate("workshop", "name location address")
      .sort({ createdAt: -1 });
    res.json({ success: true, deliveries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const listDeliveries = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.area) filter.area = req.query.area;

    if (req.user.role === "delivery-admin") {
      const regionWorkshops = await Workshop.find({ region: req.user.region }).select("_id");
      filter.workshop = { $in: regionWorkshops.map((w) => w._id) };
    } else if (!canReadAnyDelivery(req.user)) {
      if (req.user.role === "workshop-admin") {
        const managedWorkshops = await Workshop.find({ managedBy: req.user._id }).select("_id");
        filter.workshop = { $in: managedWorkshops.map((w) => w._id) };
      } else {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const deliveries = await Delivery.find(filter)
      .populate({
        path: "booking",
        select: "vehicle serviceType status paymentStatus deliveryFee distanceKm",
        populate: { path: "vehicle", select: "plateNumber make model" },
      })
      .populate("workshop", "name area region location")
      .populate("staff", "firstname lastname email")
      .sort({ createdAt: -1 });
    res.json({ success: true, deliveries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getDeliveriesForBooking = async (req, res) => {
  try {
    const booking = await ServiceRequest.findById(req.params.bookingId).select("user workshop");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    const deliveries = await Delivery.find({ booking: booking._id })
      .populate("staff", "firstname lastname email")
      .populate("workshop", "name location");

    const isOwner = booking.user.equals(req.user._id);
    if (!isOwner && !canReadAnyDelivery(req.user)) {
      if (req.user.role === "workshop-admin") {
        const workshop = await Workshop.findById(booking.workshop).select("managedBy");
        if (!workshop?.managedBy?.equals(req.user._id)) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
      } else {
        const isAssignedStaff = deliveries.some((d) => d.staff && d.staff._id.equals(req.user._id));
        if (!isAssignedStaff) return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    res.json({ success: true, deliveries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id).populate("staff", "firstname lastname email").populate("workshop", "name location area");
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });

    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    if (!(await canViewDelivery(req.user, delivery, booking))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateDeliveryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    if (!delivery.staff?.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only the assigned staff member can update this delivery" });
    }

    const allowedNext = transitionsFor(delivery.leg)[delivery.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot move from "${delivery.status}" to "${status}"` });
    }

    delivery.status = status;
    if (EN_ROUTE_STATUSES.includes(status)) delivery.startedAt = new Date();
    const isTerminal = status === "at_workshop" || status === "delivered";
    if (isTerminal) delivery.completedAt = new Date();
    await delivery.save();

    // Physical completion and financial settlement are deliberately
    // decoupled: reaching a terminal status no longer pays anyone by itself.
    // The booking's combined delivery fee is paid out via settleDeliveryFee
    // (ledgerService.js), triggered either by the main booking payment
    // (settleBookingPayment) or by assignDelivery when a leg is assigned
    // after the booking is already paid — never by a leg simply finishing.

    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    getIO().to(`booking:${delivery.booking}`).emit("delivery:status", delivery);
    if (booking) getIO().to(`user:${booking.user}`).emit("delivery:status", delivery);

    res.json({ success: true, delivery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const recordDeliveryLocation = async (req, res) => {
  try {
    const { lat, lng, speed, heading } = req.body;
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    if (!delivery.staff?.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (!EN_ROUTE_STATUSES.includes(delivery.status)) {
      return res.status(400).json({ success: false, message: "Location can only be pushed while a leg is en route" });
    }

    const point = await DeliveryLocationHistory.create({
      delivery: delivery._id,
      booking: delivery.booking,
      lat,
      lng,
      speed,
      heading: typeof heading === "number" ? heading : null,
      source: "manual",
    });
    getIO().to(`booking:${delivery.booking}`).emit("delivery:update", point);
    res.status(201).json({ success: true, point });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getDeliveryLocationHistory = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    if (!booking || !(await canViewDelivery(req.user, delivery, booking))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const history = await DeliveryLocationHistory.find({ delivery: delivery._id }).sort({ recordedAt: -1 }).limit(500);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getDeliveryLatestLocation = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ success: false, message: "Delivery not found" });
    const booking = await ServiceRequest.findById(delivery.booking).select("user");
    if (!booking || !(await canViewDelivery(req.user, delivery, booking))) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const latest = await DeliveryLocationHistory.findOne({ delivery: delivery._id }).sort({ recordedAt: -1 });
    res.json({ success: true, latest });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export { canManageDeliveries };
