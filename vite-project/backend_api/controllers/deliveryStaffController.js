import User from "../models/User.js";
import Delivery from "../models/Delivery.js";
import DeliveryStaffReview from "../models/DeliveryStaffReview.js";
import { sameRegion, regionQuery } from "../utils/region.js";

const TERMINAL_STATUSES = ["at_workshop", "delivered"];

// List delivery-staff visible to the caller: delivery-admin sees only their
// own region, admin/superadmin see everyone (or an optionally-requested
// region). Powers both AdminStaffLocationsPage and DeliveryStaffTablePage.
export const listDeliveryStaff = async (req, res) => {
  try {
    const filter = { role: "delivery-staff" };
    if (req.user.role === "delivery-admin") filter.region = regionQuery(req.user.region);
    else if (req.query.region) filter.region = regionQuery(req.query.region);

    const staff = await User.find(filter).select(
      "firstname lastname email area region deliveryRating lastKnownLocation lastSeenAt createdAt"
    );
    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// One staff member's detail: profile + rating + served count + recent
// reviews. delivery-admin callers are rejected if the target isn't in their
// region — mirrors isWorkshopScoped's narrowing style.
export const getDeliveryStaffDetail = async (req, res) => {
  try {
    const staff = await User.findOne({ _id: req.params.id, role: "delivery-staff" }).select(
      "firstname lastname email area region deliveryRating lastKnownLocation lastSeenAt createdAt"
    );
    if (!staff) return res.status(404).json({ success: false, message: "Delivery-staff account not found" });
    if (req.user.role === "delivery-admin" && !sameRegion(staff.region, req.user.region)) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    const servedCount = await Delivery.countDocuments({ staff: staff._id, status: { $in: TERMINAL_STATUSES } });
    const reviews = await DeliveryStaffReview.find({ staff: staff._id })
      .populate("user", "firstname lastname")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, staff, servedCount, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Hard delete, per the confirmed delete matrix. The query filter itself
// (not just a post-fetch check) makes it structurally impossible for this
// endpoint to delete any other role even if called with a non-staff id.
export const deleteDeliveryStaff = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, role: "delivery-staff" });
    if (!target) return res.status(404).json({ success: false, message: "Delivery-staff account not found" });
    if (req.user.role === "delivery-admin" && !sameRegion(target.region, req.user.region)) {
      return res.status(403).json({ success: false, message: "Outside your region" });
    }

    await User.deleteOne({ _id: target._id });
    res.json({ success: true, message: "Delivery-staff account deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
