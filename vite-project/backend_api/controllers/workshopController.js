import Workshop from "../models/Workshop.js";
import { rankWorkshops } from "../services/pricingService.js";

export const listWorkshops = async (req, res) => {
  try {
    const { serviceType } = req.query;
    const filter = { status: "active" };
    if (serviceType) filter["servicesOffered.serviceType"] = serviceType;

    const workshops = await Workshop.find(filter).sort({ "rating.average": -1 });
    res.json({ success: true, workshops });
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
    const { name, description, location, address, servicesOffered, contactPhone, contactEmail, images } = req.body;
    if (!name || !location?.lat || !location?.lng) {
      return res.status(400).json({ success: false, message: "name and location{lat,lng} are required" });
    }

    const workshop = await Workshop.create({
      name,
      description,
      managedBy: req.user._id,
      location,
      address,
      servicesOffered,
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
    const allowed = ["name", "description", "location", "address", "servicesOffered", "contactPhone", "contactEmail", "images", "status"];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const workshop = await Workshop.findByIdAndUpdate(req.params.id, updates, { returnDocument: "after" });
    if (!workshop) return res.status(404).json({ success: false, message: "Workshop not found" });

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
