import mongoose from "mongoose";

const LoginAttemptSchema = new mongoose.Schema({
  count: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname:  { type: String, required: true },
  email:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role: {
    type: String,
    // Narrowed admin roles sit between admin and user:
    //   vehicle-tracking-admin - the CCTV/theft pipeline only
    //   workshop-admin         - one garage's own bookings and details only
    //   accounting-admin       - reviews and pays out withdrawal requests
    //   delivery-admin         - region-scoped: assigns/manages delivery-staff, deletes delivery-staff accounts
    //   delivery-staff         - picks up/drops off vehicles in their area
    enum: [
      "superadmin",
      "admin",
      "vehicle-tracking-admin",
      "workshop-admin",
      "accounting-admin",
      "delivery-admin",
      "delivery-staff",
      "user",
    ],
    default: "user",
  },
  // extra per-user permissions on top of their role (optional, starts empty)
  permissions: {
    type: [String],
    default: [],
  },
  // Specific locality a delivery-staff member operates in (e.g. "Bharatpur").
  // Only meaningful when role is "delivery-staff" — display/filtering only;
  // assignment matching uses `region` (see assignDelivery in deliveryController.js).
  area: {
    type: String,
    default: "",
    index: true,
  },
  // Broader region (e.g. "Chitwan") a delivery-staff or delivery-admin
  // operates in. For delivery-staff, matched against Workshop.region for
  // assignment reach. For delivery-admin, defines their management reach —
  // every workshop/staff whose region matches, regardless of specific area.
  region: {
    type: String,
    default: "",
    index: true,
  },
  // Aggregate delivery-staff rating, mirroring Workshop.rating's pattern —
  // always fully recomputed by recalculateStaffAggregates
  // (deliveryReviewController.js), never incremented. Only meaningful when
  // role is "delivery-staff".
  deliveryRating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  // Ambient location, updated opportunistically any time this staff member's
  // client pushes a location point — whether or not a Delivery leg is
  // currently en route. Distinct from DeliveryLocationHistory (booking-scoped,
  // only recorded during an active en-route leg): this is "where are they
  // right now, generally," for the always-on staff-locations view. Only the
  // latest point matters — not historied.
  lastKnownLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    recordedAt: { type: Date, default: null },
  },
  // Simple online/offline signal: set whenever an ambient or en-route location
  // point arrives, cleared implicitly by staleness (checked client-side) or a
  // socket disconnect event. Only meaningful when role is "delivery-staff".
  lastSeenAt: {
    type: Date,
    default: null,
  },
  // failed login attempts tracked per source IP, so a remote attacker
  // can't lock a victim out by failing logins from a different IP
  loginAttempts: {
    type: Map,
    of: LoginAttemptSchema,
    default: () => new Map(),
  },
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);
export default User;