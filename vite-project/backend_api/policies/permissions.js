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
  "chat:read:any",
  "wallet:read:any",
  "sos:read:any",
  "sos:resolve",
  "theft:manage",
  "tracking:read:any",
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
  ...vehiclePlatformPermissions,
],

admin: [
  "user:read",
  "user:create",
  "user:delete",
  "user:promote", // ✅ OPTIONAL (if you want admins to promote)
  "admin:read",
  "admin:create",
  "database:read",
  "database:update",
  ...vehiclePlatformPermissions,
],
  user: [
    "user:read",
    ]

};


//check if user has a specific permissions
const hasPermission = (role, permission, extraPermissions = []) => {
  const rolePermissions = rolePolicies[role] || [];
  const allPermissions = [...rolePermissions, ...extraPermissions];
  return allPermissions.includes(permission);
};
export {hasPermission, rolePolicies};