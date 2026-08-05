import Workshop from "../models/Workshop.js";
import User from "../models/User.js";
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
      servicesOffered,
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
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateWorkshop = async (req, res) => {
  try {
    // workshop-admin may only edit the garage assigned to them. Checked here
    // rather than in the route, because the permission grants the capability
    // while ownership decides the scope.
    if (req.user.role === "workshop-admin") {
      const owned = await Workshop.findById(req.params.id).select("managedBy");
      if (!owned) return res.status(404).json({ success: false, message: "Workshop not found" });
      if (!owned.managedBy?.equals(req.user._id)) {
        return res.status(403).json({ success: false, message: "You can only edit your own workshop" });
      }
    }

    const allowed = ["name", "description", "location", "address", "area", "servicesOffered", "contactPhone", "contactEmail", "images", "logoUrl", "status"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
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
    res.status(500).json({ success: false, message: err.message });
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
    res.json({ success: true, message: "Workshop deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
