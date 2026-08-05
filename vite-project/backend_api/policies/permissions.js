// Delivery-admin-specific permissions — deliberately NOT folded into
// vehiclePlatformPermissions: a delivery-admin's reach is region-scoped, so
// granting delivery:manage/delivery:read:any (which are reach-unscoped in
// every existing check) would be wrong there. Controllers narrow these to
// the grantee's own region at the query level, same discipline as
// isWorkshopScoped narrows workshop-admin.
const deliveryAdminPermissions = [
  "deliverystaff:manage",        // region-scoped staff listing/assignment context
  "deliverystaff:delete",
  "deliverystaff:location:any",  // view any delivery-staff's live/ambient location
];

const vehiclePlatformPermissions = [
  "vehicle:read:any",
  "vehicle:flag",
  "vehicle:delete:any",
  "workshop:create",
  "workshop:update",
  "workshop:delete",
  "booking:manage",
  "booking:read:any",
  "cctv:submit",
  "cctv:read",
  "cctv:manage",
  "chat:read:any",
  "wallet:read:any",
  "sos:read:any",
  "sos:resolve",
  "theft:manage",
  "tracking:read:any",
  "withdrawal:read:any",
  "delivery:manage",
  "delivery:read:any",
];

const rolePolicies = {
  superadmin: [
  "user:read",
  "user:create",
  "user:delete",
  "user:promote", // ✅ ADD THIS
  "admin:read",
  "admin:create",
  "admin:delete",
  "admin:activity:read",
  "database:read",
  "database:update",
  // Superadmin can action payouts too, so the platform isn't stuck when no
  // accounting-admin exists yet. Plain admins can look but not approve.
  "withdrawal:review",
  // Delivery-staff account deletion and unrestricted live-location viewing
  // are granted directly (not via vehiclePlatformPermissions) so narrower
  // roles sharing that array — vehicle-tracking-admin, workshop-admin,
  // accounting-admin — don't inherit them.
  "deliverystaff:delete",
  "deliverystaff:location:any",
  ...vehiclePlatformPermissions,
],

admin: [
  "user:read",
  "user:create",
  "user:delete",
  "user:promote", // ✅ OPTIONAL (if you want admins to promote)
  "admin:read",
  "admin:create",
  // Lets a plain admin delete peer admin-tier accounts (and, via the
  // confirmed delete matrix, delivery-staff too) — not just superadmin's
  // privilege as it was before this role's reach was widened.
  "admin:delete",
  "database:read",
  "database:update",
  "deliverystaff:delete",
  "deliverystaff:location:any",
  ...vehiclePlatformPermissions,
],
  // A narrowed admin for the vehicle-recovery side of the platform: cameras,
  // sightings, SOS and theft reports, plus chat so owners can be contacted.
  // Deliberately excludes user/admin administration, the database tools,
  // bookings, workshops and wallets — this role is for operating the tracking
  // pipeline, not running the business.
  "vehicle-tracking-admin": [
    "user:read",
    "vehicle:read:any",
    "vehicle:flag",
    "cctv:submit",
    "cctv:read",
    "cctv:manage",
    "sos:read:any",
    "sos:resolve",
    "theft:manage",
    "tracking:read:any",
    "chat:read:any",
  ],

  // Runs a single garage. Every permission here is further narrowed at the
  // controller level to workshops where managedBy is this user — the
  // permission grants the *capability*, ownership decides the *scope*.
  // No workshop:create or workshop:delete: a garage owner manages the shop
  // they were given, they don't add or remove shops from the platform.
  "workshop-admin": [
    "user:read",
    "workshop:update",
    "booking:manage",
    "booking:read:any",
    "chat:read:any",
    // View-only: workshop-admin can see delivery status for their own
    // bookings but never assigns staff — that's admin/superadmin's job.
    "delivery:read:any",
  ],

  // Region-scoped operations manager for delivery-staff. Can assign
  // delivery-staff to bookings within their region (delivery:manage, but
  // every controller call additionally narrows by region — see
  // deliveryController.js), view any of their region's delivery-staff live
  // location, ratings and service history, and hard-delete delivery-staff
  // accounts — but *only* delivery-staff accounts, never other
  // delivery-admins or any other role (enforced in the controller, not by
  // permission alone). Deliberately excluded from ADMIN_ROLES: a
  // delivery-admin is not a general back-office admin and shouldn't land in
  // the "admins" broadcast room meant for tracking/booking/accounting
  // concerns it has no stake in.
  "delivery-admin": [
    "user:read",
    "delivery:manage",
    "delivery:read:any",
    "chat:read:any",
    ...deliveryAdminPermissions,
  ],

  // Picks up and drops off customers' vehicles for their assigned area.
  // Can only see/act on Delivery documents where `staff` is themselves —
  // enforced at the controller level the same way booking ownership is,
  // not via a delivery:read:any/delivery:manage grant they deliberately
  // don't have. chat:read:any lets them message a customer about a delay.
  "delivery-staff": [
    "user:read",
    "chat:read:any",
  ],

  // Reviews withdrawal requests and pays them out of the company account.
  // Deliberately has no booking, workshop, CCTV or user administration: the
  // person handling real money should be able to do exactly that and nothing
  // else. wallet:read:any lets them see balances while checking a request.
  "accounting-admin": [
    "user:read",
    "wallet:read:any",
    "withdrawal:read:any",
    "withdrawal:review",
    "chat:read:any",
  ],

  user: [
    "user:read",
    ]

};


// Every role that belongs in the admin area and should receive admin-facing
// realtime events (the "admins" socket room) and be reachable in support chat.
// Kept here so adding a role means editing one list, not hunting for
// role === "admin" checks across the codebase.
const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "vehicle-tracking-admin",
  "workshop-admin",
  "accounting-admin",
];

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

// Roles whose reach is limited to workshops they manage. Controllers use this
// to decide whether to scope a query by managedBy.
const isWorkshopScoped = (role) => role === "workshop-admin" || role === "admin";

// A region-scoped delivery operations manager — not a general back-office
// admin (see the ADMIN_ROLES comment above), so kept as its own check rather
// than folded into isAdminRole.
const isDeliveryAdmin = (role) => role === "delivery-admin";

//check if user has a specific permissions
const hasPermission = (role, permission, extraPermissions = []) => {
  const rolePermissions = rolePolicies[role] || [];
  const allPermissions = [...rolePermissions, ...extraPermissions];
  return allPermissions.includes(permission);
};
export {hasPermission, rolePolicies, ADMIN_ROLES, isAdminRole, isWorkshopScoped, isDeliveryAdmin};