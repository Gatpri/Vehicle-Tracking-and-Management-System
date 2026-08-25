import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Delivery from "../models/Delivery.js";
import DeliveryStaffReview from "../models/DeliveryStaffReview.js";
import { sameRegion, regionQuery } from "../utils/region.js";

const TERMINAL_STATUSES = ["at_workshop", "delivered"];

/**
 * List delivery-staff.
 *
 * Every caller sees every staff member, including a delivery-admin looking
 * outside their own region. Visibility and authority are deliberately
 * separated here: a delivery-admin can *see* national coverage — useful for
 * knowing who covers a neighbouring region when a delivery crosses a
 * boundary — but can only add or delete within their own region, which
 * createDeliveryStaff and deleteDeliveryStaff enforce independently.
 *
 * `canManageRegion` is returned per row so a client does not have to
 * reimplement the region rule to decide which buttons to show. It is a
 * convenience for rendering, never the check itself — the write endpoints
 * re-derive it server-side.
 *
 * Powers AdminStaffLocationsPage, DeliveryStaffTablePage and the mobile
 * delivery-staff screen.
 */
export const listDeliveryStaff = async (req, res) => {
  try {
    const filter = { role: "delivery-staff" };
    // An explicit ?region= still narrows the list for anyone who asks,
    // including a delivery-admin who wants to look at one region at a time.
    if (req.query.region) filter.region = regionQuery(req.query.region);

    const staff = await User.find(filter).select(
      "firstname lastname email area region deliveryRating lastKnownLocation lastSeenAt createdAt"
    );

    const isRegionScoped = req.user.role === "delivery-admin";
    const withScope = staff.map((s) => ({
      ...s.toObject(),
      canManage: !isRegionScoped || sameRegion(s.region, req.user.region),
    }));

    res.json({
      success: true,
      staff: withScope,
      // The caller's own region, so a client can label what it may act on
      // without a second request.
      myRegion: isRegionScoped ? req.user.region ?? "" : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Create a delivery-staff account.
 *
 * A delivery-admin may only create staff in their own region, and the region
 * is taken from their own record rather than from the request body — the
 * client cannot ask for a different one, so there is no request that would
 * place staff outside the creator's authority. admin/superadmin are unscoped
 * and pass a region explicitly.
 *
 * Role is hardcoded to "delivery-staff" for the same reason the delete query
 * filters on it: this endpoint must not be a way to mint an account of any
 * other role, whatever the body contains.
 */
export const createDeliveryStaff = async (req, res) => {
  try {
    const { firstname, lastname, email, password, area } = req.body;

    if (!firstname?.trim() || !lastname?.trim()) {
      return res.status(400).json({ success: false, message: "First and last name are required" });
    }
    if (firstname.length > 50 || lastname.length > 50) {
      return res.status(400).json({ success: false, message: "Names must be under 50 characters" });
    }
    if (!email?.trim()) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
    }

    // The whole region rule, in one place.
    const region =
      req.user.role === "delivery-admin" ? req.user.region : (req.body.region ?? "").trim();

    if (!String(region ?? "").trim()) {
      return res.status(400).json({
        success: false,
        message:
          req.user.role === "delivery-admin"
            ? "Your account has no region set, so it cannot create staff. Ask an admin to set one."
            : "Region is required",
      });
    }

    const existing = await User.findOne({ email: email.trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: "An account with that email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const staff = await User.create({
      firstname: firstname.trim(),
      lastname: lastname.trim(),
      email: email.trim(),
      password: hashed,
      role: "delivery-staff",
      region,
      area: (area ?? "").trim(),
      // No verification step: signup.js holds unverified accounts in the
      // separate PendingUser collection and only writes to User once the
      // emailed link is followed, so a record existing here already means
      // verified. An admin-created account is trusted by the same logic.
    });

    const staffObj = staff.toObject();
    delete staffObj.password;

    res.status(201).json({ success: true, staff: staffObj });
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
