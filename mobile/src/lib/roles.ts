// Single source of truth for who can reach which part of the app.
//
// Ported verbatim from the web app's src/lib/roles.ts — every constant and
// predicate below is byte-identical, because both clients must agree on who
// sees what. Only landingPathFor differs, at the bottom, since the mobile
// route paths are not the web router's.
//
// Mirrors backend_api/policies/permissions.js — the server is the real gate;
// this only decides what is worth showing.

/** Full platform administration: users, bookings, workshops, everything. */
export const FULL_ADMIN_ROLES = ["admin", "superadmin"];

/** Narrowed admin for the vehicle-recovery pipeline only. */
export const TRACKING_ADMIN_ROLE = "vehicle-tracking-admin";

/** Runs a single garage: its bookings, its details, its customers. */
export const WORKSHOP_ADMIN_ROLE = "workshop-admin";

/**
 * An ordinary customer — the only role the public-facing app (home page and
 * everything it links to) is meant for. Staff roles have their own areas and
 * are deliberately kept out, so a mis-typed URL can't drop an admin into the
 * customer shell.
 */
export const CUSTOMER_ROLE = "user";

/** Reviews withdrawal requests and pays them out of the company account. */
export const ACCOUNTING_ADMIN_ROLE = "accounting-admin";

/**
 * Picks up and drops off customers' vehicles between their location and a
 * workshop. Deliberately NOT part of ADMIN_AREA_ROLES — a field-worker role,
 * not back-office — so it gets its own minimal layout (StaffLayout) instead
 * of AdminLayout's full admin nav.
 */
export const DELIVERY_STAFF_ROLE = "delivery-staff";

/**
 * Region-scoped operations manager for delivery-staff: assigns deliveries
 * within their region, views region staff's live location/ratings/history,
 * and can delete delivery-staff accounts (only that role, only in-region).
 * Unlike delivery-staff, this genuinely is back-office work, so it reuses
 * AdminLayout rather than getting its own bespoke shell.
 */
export const DELIVERY_ADMIN_ROLE = "delivery-admin";

/** Anyone who belongs in the admin area at all. */
export const ADMIN_AREA_ROLES = [
  ...FULL_ADMIN_ROLES,
  TRACKING_ADMIN_ROLE,
  WORKSHOP_ADMIN_ROLE,
  ACCOUNTING_ADMIN_ROLE,
];

/** Who can view (not necessarily assign) delivery status for a booking. */
export const DELIVERY_VIEWER_ROLES = [...FULL_ADMIN_ROLES, WORKSHOP_ADMIN_ROLE];

/** Roles that may reach /admin/deliveries (assign + view), region-scoped for delivery-admin. */
export const DELIVERY_MANAGE_ROLES = [...FULL_ADMIN_ROLES, DELIVERY_ADMIN_ROLE];

/** Roles that may reach the "any online staff's live location" view. */
export const STAFF_LOCATION_VIEWER_ROLES = [...FULL_ADMIN_ROLES, DELIVERY_ADMIN_ROLE];

/** Withdrawals page: accounting reviews them, admins can look. */
export const ACCOUNTING_ROLES = [...FULL_ADMIN_ROLES, ACCOUNTING_ADMIN_ROLE];

/** Vehicle-recovery pages: CCTV, SOS, theft reports. */
export const TRACKING_ROLES = [...FULL_ADMIN_ROLES, TRACKING_ADMIN_ROLE];

/** Booking and workshop pages. */
export const WORKSHOP_ROLES = [...FULL_ADMIN_ROLES, WORKSHOP_ADMIN_ROLE];

/** Chat is shared by every admin-area role, plus delivery-admin (which isn't
 * part of ADMIN_AREA_ROLES itself — see that constant's own comment). */
export const CHAT_ROLES = [...ADMIN_AREA_ROLES, DELIVERY_ADMIN_ROLE];

/**
 * The customer app: home page, vehicles, bookings, workshops, wallet, SOS.
 * Customers only — every staff role has a landing page of its own, so an admin
 * who types /home is redirected back to their own area rather than being shown
 * a shell full of links that would each bounce them anyway.
 */
export const CUSTOMER_ROLES = [CUSTOMER_ROLE];

export const isTrackingAdmin = (role?: string) => role === TRACKING_ADMIN_ROLE;
export const isWorkshopAdmin = (role?: string) => role === WORKSHOP_ADMIN_ROLE;
export const isAccountingAdmin = (role?: string) => role === ACCOUNTING_ADMIN_ROLE;
export const isDeliveryStaff = (role?: string) => role === DELIVERY_STAFF_ROLE;
export const isDeliveryAdmin = (role?: string) => role === DELIVERY_ADMIN_ROLE;

/**
 * Where a role lands after sign-in — never a screen it would be bounced from.
 *
 * Same contract as the web version: every branch must return a route that role
 * actually passes, or the guard sends them back here and loops. The paths are
 * the mobile router's own (app/(customer), app/(admin), app/(staff)) rather
 * than the web app's URLs.
 */
export const landingPathFor = (role?: string): string => {
  if (!role) return "/login";
  if (isTrackingAdmin(role)) return "/(admin)/cctv";
  if (isWorkshopAdmin(role)) return "/(admin)/bookings";
  if (isAccountingAdmin(role)) return "/(admin)/withdrawals";
  if (isDeliveryStaff(role)) return "/(staff)/deliveries";
  if (isDeliveryAdmin(role)) return "/(admin)/delivery-staff";
  if (FULL_ADMIN_ROLES.includes(role)) return "/(admin)/dashboard";
  if (role === CUSTOMER_ROLE) return "/(customer)/home";
  return "/login";
};
