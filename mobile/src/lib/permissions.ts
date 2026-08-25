/**
 * Client-side mirror of backend_api/policies/permissions.js.
 *
 * Same contract as the web app's roles.ts: the server is the real gate, and
 * this only decides what is worth showing. A screen that hides a button on the
 * strength of this is a convenience, never a security boundary — every route
 * behind it re-checks server-side.
 *
 * Kept as its own module rather than folded into roles.ts because roles.ts is
 * a verbatim port of the web file, and this has no web counterpart: the web
 * admin pages read permissions off the user object ad hoc, which works there
 * but would mean repeating the same string literals across sixteen screens.
 */

const deliveryAdminPermissions = [
  "deliverystaff:manage",
  "deliverystaff:create",
  "deliverystaff:delete",
  "deliverystaff:location:any",
];

const vehiclePlatformPermissions = [
  "vehicle:read:any",
  "vehicle:flag",
  "vehicle:delete:any",
  "workshop:create",
  "workshop:update",
  "workshop:delete",
  "workshop:review-request",
  "workshop:request-update",
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

const rolePolicies: Record<string, string[]> = {
  superadmin: [
    "user:read",
    "user:create",
    "user:delete",
    "user:promote",
    "admin:read",
    "admin:create",
    "admin:delete",
    "admin:activity:read",
    "database:read",
    "database:update",
    "withdrawal:review",
    "deliverystaff:create",
    "deliverystaff:delete",
    "deliverystaff:location:any",
    ...vehiclePlatformPermissions,
  ],
  admin: [
    "user:read",
    "user:create",
    "user:delete",
    "user:promote",
    "admin:read",
    "admin:create",
    "admin:delete",
    "database:read",
    "database:update",
    "deliverystaff:create",
    "deliverystaff:delete",
    "deliverystaff:location:any",
    ...vehiclePlatformPermissions,
  ],
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
  "workshop-admin": [
    "user:read",
    "workshop:request-update",
    "booking:manage",
    "booking:read:any",
    "chat:read:any",
    "delivery:read:any",
  ],
  "delivery-admin": [
    "user:read",
    "delivery:manage",
    "delivery:read:any",
    "chat:read:any",
    ...deliveryAdminPermissions,
  ],
  "delivery-staff": ["user:read", "chat:read:any"],
  "accounting-admin": [
    "user:read",
    "wallet:read:any",
    "withdrawal:read:any",
    "withdrawal:review",
    "chat:read:any",
  ],
  user: [],
};

/**
 * Does this role hold the permission? `extraPermissions` are per-user grants
 * stored on the User document, exactly as the backend treats them.
 */
export const hasPermission = (
  role?: string,
  permission?: string,
  extraPermissions: string[] = []
): boolean => {
  if (!role || !permission) return false;
  const rolePermissions = rolePolicies[role] || [];
  return [...rolePermissions, ...extraPermissions].includes(permission);
};

export { rolePolicies };
