/**
 * Which roles answer which chat channel.
 *
 * Kept apart from policies/permissions.js because these are *audiences*, not
 * permissions: "who should see a new support message" is a routing question,
 * and expressing it as a permission would mean inventing grants like
 * `chat:answer:support` that no other part of the system consults.
 *
 * The frontend mirrors these names in its own roles module; the server is the
 * authority and re-checks every read (see services/chatChannels.js).
 */

/** Full platform administration — answers Customer Support. */
export const FULL_ADMIN_ROLES = ["admin", "superadmin"];

/**
 * Answers the Vehicle Tracking channel. Full admins are included because they
 * oversee the recovery pipeline too, matching TRACKING_ROLES in the frontend's
 * roles.ts.
 */
export const TRACKING_ROLES = [...FULL_ADMIN_ROLES, "vehicle-tracking-admin"];
