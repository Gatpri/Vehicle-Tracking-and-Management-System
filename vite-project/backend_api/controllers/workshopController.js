import Workshop from "../models/Workshop.js";
import User from "../models/User.js";
import WorkshopChangeRequest from "../models/WorkshopChangeRequest.js";
import { getIO } from "../config/socket.js";
import { notify } from "../services/notificationService.js";
import { rankWorkshops, sortWorkshops } from "../services/pricingService.js";
import { haversineDistanceKm } from "../utils/geo.js";
import { uploadImage } from "../services/cloudinaryService.js";
import { VEHICLE_BRANDS, BIKE_TYPES } from "../constants/workshopOptions.js";

// Normalizes either a comma-separated query param ("Yamaha,KTM") or a JSON
// body array into a clean list, dropping anything not in the allowed set so a
// hand-crafted request can't store a value the UI could never offer.
const parseList = (raw, allowed) => {
  const items = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  return [...new Set(items.map((v) => String(v).trim()).filter((v) => allowed.includes(v)))];
};

// parseServicesOffered throws with a message meant for the person who typed
// the row, so it belongs in the response as a 400 — anything else is ours and
// stays in the log.
class ServicesValidationError extends Error {}

const respondToValidationError = (res, err) => {
  if (err instanceof ServicesValidationError) {
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ success: false, message: "Something went wrong" });
};

// The services table is what every booking is priced against, so a malformed
// row here becomes a wrong bill later. Returns a cleaned array, or throws with
// a message naming the offending row.
const parseServicesOffered = (raw) => {
  if (!Array.isArray(raw)) {
    throw new ServicesValidationError("Services must be a list of rows");
  }
  const seen = new Set();
  return raw.map((row, i) => {
    const serviceType = String(row?.serviceType ?? "").trim();
    if (!serviceType) throw new ServicesValidationError(`Row ${i + 1}: service name is required`);
    if (serviceType.length > 60) throw new ServicesValidationError(`Row ${i + 1}: service name is too long`);

    const key = serviceType.toLowerCase();
    if (seen.has(key)) throw new ServicesValidationError(`"${serviceType}" is listed twice`);
    seen.add(key);

    const basePrice = Number(row?.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      throw new ServicesValidationError(`Row ${i + 1}: "${serviceType}" needs a price of 0 or more`);
    }
    // Stored in paisa, so a fractional value is a caller bug rather than a
    // real amount — rounding silently would quietly alter the price.
    if (!Number.isInteger(basePrice)) {
      throw new ServicesValidationError(`Row ${i + 1}: "${serviceType}" price must be a whole number of paisa`);
    }
    return { serviceType, basePrice };
  });
};

export const listWorkshops = async (req, res) => {
  try {
    const { serviceType, brands, bikeTypes, sortBy, lat, lng } = req.query;

    const filter = { status: "active" };
    if (serviceType) filter["servicesOffered.serviceType"] = serviceType;

    const brandFilter = parseList(brands, VEHICLE_BRANDS);
    const typeFilter = parseList(bikeTypes, BIKE_TYPES);
    if (brandFilter.length) filter.brandsSupported = { $in: brandFilter };
    if (typeFilter.length) filter.bikeTypes = { $in: typeFilter };

    const workshops = await Workshop.find(filter).lean();

    // Distance is computed here rather than in Mongo: the collection is small,
    // and a $geoNear would mean reindexing location as GeoJSON.
    const origin = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
    const withDistance = workshops.map((w) => ({
      ...w,
      distanceKm: origin ? Number(haversineDistanceKm(origin, w.location).toFixed(2)) : null,
    }));

    const sorted = sortWorkshops(withDistance, sortBy, Boolean(origin));

    res.json({
      success: true,
      workshops: sorted,
      // Echoed back so the UI can show what's actually applied without
      // re-deriving it from its own state.
      appliedFilters: { brands: brandFilter, bikeTypes: typeFilter, sortBy: sortBy ?? "best" },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const recommendWorkshops = async (req, res) => {
  try {
    const { lat, lng, serviceType } = req.query;
    if (!lat || !lng || !serviceType) {
      return res.status(400).json({ success: false, message: "lat, lng, and serviceType are required" });
    }

    const workshops = await Workshop.find({ status: "active", "servicesOffered.serviceType": serviceType });
    const ranked = rankWorkshops(workshops, { lat: Number(lat), lng: Number(lng) }, serviceType);

    res.json({
      success: true,
      recommendations: ranked.map((r) => ({
        workshop: r.workshop,
        distanceKm: Number(r.distanceKm.toFixed(2)),
        matchedPrice: r.price,
        score: Number(r.score.toFixed(4)),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });
    res.json({ success: true, workshop });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createWorkshop = async (req, res) => {
  try {
    const {
      name, description, location, address, area, servicesOffered,
      contactPhone, contactEmail, images, brandsSupported, bikeTypes,
    } = req.body;
    if (!name || !location?.lat || !location?.lng) {
      return res.status(400).json({ success: false, message: "name and location{lat,lng} are required" });
    }

    const workshop = await Workshop.create({
      name,
      description,
      managedBy: req.user._id,
      location,
      address,
      area,
      region: req.body.region,
      servicesOffered: parseServicesOffered(servicesOffered ?? []),
      // Filtered against the allowed lists so a crafted request can't store a
      // brand the UI could never offer; the schema enum rejects it anyway, but
      // this fails quietly instead of 500-ing on a validation error.
      brandsSupported: parseList(brandsSupported, VEHICLE_BRANDS),
      bikeTypes: parseList(bikeTypes, BIKE_TYPES),
      contactPhone,
      contactEmail,
      images,
    });
    res.status(201).json({ success: true, workshop });
  } catch (err) {
    respondToValidationError(res, err);
  }
};

export const updateWorkshop = async (req, res) => {
  try {
    // A workshop-admin's edits go through review instead — see
    // submitWorkshopChangeRequest. The services table prices every booking, so
    // changing it is a decision for whoever oversees the platform, not the
    // garage being paid.
    if (req.user.role === "workshop-admin") {
      return res.status(403).json({
        success: false,
        message: "Submit your changes for approval instead — use the request flow",
      });
    }

    const allowed = ["name", "description", "location", "address", "area", "region", "servicesOffered", "contactPhone", "contactEmail", "images", "logoUrl", "status"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.servicesOffered !== undefined) {
      updates.servicesOffered = parseServicesOffered(updates.servicesOffered);
    }
    // Validated separately rather than passed straight through — rating and
    // sentiment are deliberately absent from `allowed` too, since both are
    // derived from reviews and must never be settable over the API.
    if (req.body.brandsSupported !== undefined) {
      updates.brandsSupported = parseList(req.body.brandsSupported, VEHICLE_BRANDS);
    }
    if (req.body.bikeTypes !== undefined) {
      updates.bikeTypes = parseList(req.body.bikeTypes, BIKE_TYPES);
    }

    const workshop = await Workshop.findByIdAndUpdate(req.params.id, updates, { returnDocument: "after" });
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

    res.json({ success: true, workshop });
  } catch (err) {
    respondToValidationError(res, err);
  }
};

// Links a garage to the account that runs it. This is the single fact that
// makes "their workshop" meaningful — every workshop-admin scope check reads
// managedBy, so assigning it here is what grants access to bookings, editing
// and customer chat for that garage.
//
// Admin/superadmin only. Promoting the account to workshop-admin happens here
// too, so an admin does one action instead of remembering two.
export const assignManager = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "email is required" });
    }

    const workshop = await Workshop.findById(req.params.id);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

    const manager = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!manager) {
      return res.status(404).json({ success: false, message: "No account with that email" });
    }
    if (manager.role === "superadmin") {
      return res.status(400).json({ success: false, message: "Superadmin can't be a workshop manager" });
    }

    // A plain user becomes a workshop-admin on assignment. An existing admin
    // keeps their role — being handed a garage shouldn't demote them.
    if (manager.role === "user") {
      manager.role = "workshop-admin";
      await manager.save();
    }

    workshop.managedBy = manager._id;
    await workshop.save();

    res.json({
      success: true,
      workshop,
      manager: {
        _id: manager._id,
        firstname: manager.firstname,
        lastname: manager.lastname,
        email: manager.email,
        role: manager.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// A logo makes a garage recognisable in listings and on the service history.
// Same ownership rule as editing: a workshop-admin may only touch their own.
export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "An image file is required" });
    }

    const workshop = await Workshop.findById(req.params.id);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });
    if (req.user.role === "workshop-admin" && !workshop.managedBy?.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only edit your own workshop" });
    }

    workshop.logoUrl = await uploadImage(req.file.buffer, "workshop-logos");
    await workshop.save();

    res.json({ success: true, workshop });
  } catch (err) {
    const status = err.message.startsWith("Missing Cloudinary env vars") ? 503 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// The garage this account runs — how a workshop-admin's pages find "their"
// workshop without being told an id.
export const getMyWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findOne({ managedBy: req.user._id });
    if (!workshop) {
      return res.status(404).json({ success: false, message: "No workshop is assigned to your account yet" });
    }
    res.json({ success: true, workshop });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteWorkshop = async (req, res) => {
  try {
    const workshop = await Workshop.findByIdAndDelete(req.params.id);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });
    // The garage is gone, so any open request against it is unanswerable.
    await WorkshopChangeRequest.deleteMany({ workshop: req.params.id, status: "pending" });
    res.json({ success: true, message: "Workshop deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * =========================
 * CHANGE REQUESTS
 * =========================
 * A workshop-admin can't write to their garage directly (see updateWorkshop),
 * so every edit they want becomes a request an admin/superadmin approves.
 */

// Fields a workshop-admin may propose. Deliberately excludes managedBy and
// status: who runs a garage, and whether it's listed at all, are platform
// decisions that a request flow shouldn't be able to launder.
const REQUESTABLE_FIELDS = [
  "name", "description", "address", "area", "region",
  "servicesOffered", "contactPhone", "contactEmail",
];

export const submitWorkshopChangeRequest = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

    // Same ownership rule the direct edit used to enforce.
    if (req.user.role === "workshop-admin" && !workshop.managedBy?.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only request changes to your own workshop" });
    }

    const proposed = {};
    for (const key of REQUESTABLE_FIELDS) {
      if (req.body[key] !== undefined) proposed[key] = req.body[key];
    }
    if (proposed.servicesOffered !== undefined) {
      proposed.servicesOffered = parseServicesOffered(proposed.servicesOffered);
    }
    if (Object.keys(proposed).length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to change" });
    }

    // Only what's actually being proposed, so the reviewer's before/after
    // comparison doesn't include untouched fields.
    const snapshot = {};
    for (const key of Object.keys(proposed)) snapshot[key] = workshop[key];

    // One open request at a time — the partial unique index enforces this too,
    // but answering plainly beats surfacing a duplicate-key error.
    const open = await WorkshopChangeRequest.findOne({ workshop: workshop._id, status: "pending" });
    if (open) {
      return res.status(409).json({
        success: false,
        message: "You already have a change request awaiting review",
      });
    }

    const request = await WorkshopChangeRequest.create({
      workshop: workshop._id,
      requestedBy: req.user._id,
      proposed,
      snapshot,
    });

    try {
      getIO().to("admins").emit("workshop:change-requested", {
        requestId: request._id.toString(),
        workshop: workshop.name,
      });
    } catch { /* a socket outage must not fail the request */ }

    res.status(201).json({ success: true, request });
  } catch (err) {
    respondToValidationError(res, err);
  }
};

// Admins see every pending request; a workshop-admin sees their own garage's
// history so they can tell whether an edit landed and why not.
export const listWorkshopChangeRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    if (req.user.role === "workshop-admin") {
      const mine = await Workshop.find({ managedBy: req.user._id }).select("_id");
      filter.workshop = { $in: mine.map((w) => w._id) };
    }

    const requests = await WorkshopChangeRequest.find(filter)
      .populate("workshop", "name area region servicesOffered")
      .populate("requestedBy", "firstname lastname email")
      .populate("reviewedBy", "firstname lastname email")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const reviewWorkshopChangeRequest = async (req, res) => {
  try {
    const { decision, note } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ success: false, message: "decision must be 'approved' or 'rejected'" });
    }

    const request = await WorkshopChangeRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "pending") {
      return res.status(409).json({ success: false, message: `This request was already ${request.status}` });
    }

    if (decision === "approved") {
      const workshop = await Workshop.findById(request.workshop);
      if (!workshop) {
        return res.status(404).json({ success: false, message: "That workshop no longer exists" });
      }
      // Re-validated at approval time: the request may have sat for a while,
      // and applying it unchecked would trust data validated against an older
      // version of these rules.
      const updates = { ...request.proposed };
      if (updates.servicesOffered !== undefined) {
        updates.servicesOffered = parseServicesOffered(updates.servicesOffered);
      }
      Object.assign(workshop, updates);
      await workshop.save();
    }

    request.status = decision;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.reviewNote = String(note ?? "").trim();
    await request.save();

    await notify({
      user: request.requestedBy,
      type: "general",
      title: decision === "approved" ? "Workshop changes approved" : "Workshop changes rejected",
      body: request.reviewNote || (decision === "approved"
        ? "Your requested changes are now live."
        : "Your requested changes were not applied."),
      link: "/admin/workshops",
      meta: { requestId: String(request._id) },
    });

    res.json({ success: true, request });
  } catch (err) {
    respondToValidationError(res, err);
  }
};
