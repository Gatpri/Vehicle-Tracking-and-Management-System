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
import { moveBookingTo } from "../services/bookingStatusService.js";
import { BOOKING_STATUS, InvalidTransitionError, canTransition } from "../constants/bookingWorkflow.js";
import { sameRegion, regionQuery } from "../utils/region.js";

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


// Each driver-facing delivery status drives the customer/workshop-facing
// booking status, so the two can never disagree — the old code tracked them
// independently, which let a workshop mark a job started while the vehicle
// was still in the van.
const PICKUP_LEG_TO_BOOKING = {
  en_route_to_pickup: BOOKING_STATUS.OUT_FOR_DELIVERY,
  picked_up: BOOKING_STATUS.PICKED_UP,
  at_workshop: BOOKING_STATUS.DROPPED,
};
// The return leg reports the vehicle leaving the workshop, then arriving with
// the customer. "assigned -> en_route_to_dropoff" is the driver collecting it,
// which is what the customer sees as "Picked from workshop".
const RETURN_LEG_TO_BOOKING = {
  en_route_to_dropoff: BOOKING_STATUS.RETURN_PICKED_FROM_WORKSHOP,
  delivered: BOOKING_STATUS.DELIVERED,
};

// Legs where the staff member is still committed to this job and therefore
// unavailable for another. "at_workshop"/"delivered" release them.
const ACTIVE_DELIVERY_STATUSES = [
  "assigned",
  "en_route_to_pickup",
  "picked_up",
  "en_route_to_workshop",
  "en_route_to_dropoff",
];

// A staff member may hold at most one live leg at a time. Without this the
// same person could be assigned to unlimited concurrent bookings — there was
// no availability check anywhere before.
const findActiveDeliveryForStaff = (staffId, excludeDeliveryId = null) =>
  Delivery.findOne({
    staff: staffId,
    status: { $in: ACTIVE_DELIVERY_STATUSES },
    ...(excludeDeliveryId ? { _id: { $ne: excludeDeliveryId } } : {}),
  });

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
    if (area) workshopFilter.area = regionQuery(area);
    if (region) workshopFilter.region = regionQuery(region);
    const workshops = await Workshop.find(workshopFilter).select("_id name area region location");
    const workshopIds = workshops.map((w) => w._id);
    const workshopById = new Map(workshops.map((w) => [String(w._id), w]));

    // A booking is assignable exactly when it's sitting in the status that
    // waits for an assignment: delivery-requested for the pickup leg (the
    // customer has asked), completed for the return leg (paid and the workshop
    // has signed the work off, so the vehicle is free to go back).
    const candidates = await ServiceRequest.find({
      workshop: { $in: workshopIds },
      status: { $in: [BOOKING_STATUS.DELIVERY_REQUESTED, BOOKING_STATUS.COMPLETED] },
      deliveryRequested: true,
    })
      .populate("vehicle", "plateNumber make model vehicleType")
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
        if (booking.status === BOOKING_STATUS.DELIVERY_REQUESTED && !legs.has("pickup")) leg = "pickup";
        else if (booking.status === BOOKING_STATUS.COMPLETED && !legs.has("return")) leg = "return";
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
    if (area) filter.area = regionQuery(area);
    if (region) filter.region = regionQuery(region);
    const staff = await User.find(filter).select("firstname lastname email area region").lean();

    // Whoever is mid-delivery can't take another job (assignDelivery refuses
    // it), so say so here rather than letting an admin pick someone and only
    // then be told no.
    const activeLegs = await Delivery.find({
      staff: { $in: staff.map((s) => s._id) },
      status: { $in: ACTIVE_DELIVERY_STATUSES },
    }).select("staff");
    const busyIds = new Set(activeLegs.map((d) => String(d.staff)));

    res.json({
      success: true,
      staff: staff.map((s) => ({ ...s, busy: busyIds.has(String(s._id)) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong" });
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

    // Each leg is assignable from exactly one booking status, so the workflow
    // itself is the gate — no separate combination of flags to keep in sync.
    if (leg === "pickup" && booking.status !== BOOKING_STATUS.DELIVERY_REQUESTED) {
      return res.status(409).json({
        success: false,
        message: "The customer hasn't requested pickup for this booking yet",
      });
    }
    if (leg === "return" && booking.status !== BOOKING_STATUS.COMPLETED) {
      return res.status(409).json({
        success: false,
        message: "This booking isn't ready for return delivery yet",
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
    if (req.user.role === "delivery-admin" && !sameRegion(workshop.region, req.user.region)) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "delivery-staff") {
      return res.status(400).json({ success: false, message: "Staff member not found or not a delivery-staff account" });
    }
    if (workshop.region && !sameRegion(staff.region, workshop.region)) {
      return res.status(400).json({ success: false, message: "Staff member's region does not match the workshop's region" });
    }

    let delivery = await Delivery.findOne({ booking: bookingId, leg });
    if (delivery && !["unassigned", "assigned"].includes(delivery.status)) {
      return res.status(400).json({ success: false, message: `This ${leg} leg is already ${delivery.status}` });
    }

    // Someone mid-delivery can't take a second job — they and the vehicle are
    // physically committed until they drop off.
    const busyOn = await findActiveDeliveryForStaff(staff._id, delivery?._id);
    if (busyOn) {
      return res.status(409).json({
        success: false,
        message: `${staff.firstname} ${staff.lastname} is already on another delivery`,
      });
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

    // Assigning a leg moves the booking itself along, so both the customer and
    // the workshop see that a driver is now on it.
    await moveBookingTo(
      booking,
      leg === "pickup" ? BOOKING_STATUS.DELIVERY_ASSIGNED : BOOKING_STATUS.RETURN_ASSIGNED,
    );

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

    // One reassignment per leg. The booking reaching "delivery-reassigned" is
    // the record that the turn has been used — without this the endpoint
    // accepted the same call indefinitely, and hiding the button only stopped
    // the honest path.
    const existingBooking = await ServiceRequest.findById(delivery.booking).select("status");
    if (existingBooking?.status === BOOKING_STATUS.RETURN_REASSIGNED) {
      return res.status(409).json({
        success: false,
        message: "This delivery has already been reassigned once",
      });
    }

    // Same round-trip, same staff member. The whole delivery fee is paid once
    // to a single person (settleDeliveryFee), so a return leg can never move
    // to a different driver — reassigning here re-confirms the original one
    // rather than swapping them out.
    //
    // Checked against THIS delivery's own current staff, not the sibling
    // pickup leg — a booking fast-tracked straight to "completed" (e.g. no
    // delivery ever requested for pickup, only for return) has no pickup leg
    // to compare against at all, and comparing against a leg that may not
    // exist let a genuine staff swap through undetected.
    if (delivery.leg === "return" && delivery.staff && String(delivery.staff) !== String(staffId)) {
      return res.status(400).json({
        success: false,
        message:
          "The return leg belongs to the driver who did the pickup — reassign confirms them, it can't swap in someone else",
      });
    }

    const workshop = await Workshop.findById(delivery.workshop);
    if (req.user.role === "delivery-admin" && !sameRegion(workshop?.region, req.user.region)) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    const staff = await User.findById(staffId);
    if (!staff || staff.role !== "delivery-staff") {
      return res.status(400).json({ success: false, message: "Staff member not found or not a delivery-staff account" });
    }
    if (workshop?.region && !sameRegion(staff.region, workshop.region)) {
      return res.status(400).json({ success: false, message: "Staff member's region does not match the workshop's region" });
    }

    delivery.staff = staff._id;
    delivery.assignedBy = req.user._id;
    delivery.assignedAt = new Date();
    await delivery.save();

    const booking = await ServiceRequest.findById(delivery.booking);

    // A return-leg reassignment is visible on the booking itself, so the
    // customer and workshop can see the handover rather than the driver
    // silently changing underneath them. The pickup leg has no equivalent
    // status — it's still simply "delivery assigned" either way.
    if (delivery.leg === "return" && booking && canTransition(booking, BOOKING_STATUS.RETURN_REASSIGNED)) {
      await moveBookingTo(booking, BOOKING_STATUS.RETURN_REASSIGNED);
    }

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
    if (err instanceof InvalidTransitionError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong" });
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
        populate: { path: "vehicle", select: "plateNumber make model vehicleType" },
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
      const regionWorkshops = await Workshop.find({ region: regionQuery(req.user.region) }).select("_id");
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
        populate: { path: "vehicle", select: "plateNumber make model vehicleType" },
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

    const booking = await ServiceRequest.findById(delivery.booking);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    // A cancelled booking stands its legs down — the driver shouldn't be able
    // to keep advancing a job that no longer exists.
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return res.status(409).json({ success: false, message: "This booking has been cancelled" });
    }

    // Move the booking first: if this step isn't legal for the booking's
    // workflow the delivery must not advance either, or the two would drift
    // apart — which is exactly the bug this whole state machine exists to stop.
    const nextBookingStatus = (delivery.leg === "pickup" ? PICKUP_LEG_TO_BOOKING : RETURN_LEG_TO_BOOKING)[status];
    if (nextBookingStatus) {
      await moveBookingTo(booking, nextBookingStatus);
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

    getIO().to(`booking:${delivery.booking}`).emit("delivery:status", delivery);
    getIO().to(`user:${booking.user}`).emit("delivery:status", delivery);

    res.json({ success: true, delivery });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong" });
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
