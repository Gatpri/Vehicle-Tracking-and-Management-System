import Workshop from "../models/Workshop.js";
import { hasPermission } from "./permissions.js";

// Shared by deliveryController.js (REST) and deliveryHandlers.js (socket) so
// the check never drifts out of sync between the two entry points — unlike
// vehicle tracking's much simpler one-line ownership check, this one needs a
// conditional workshop lookup, which makes duplicating it risky.
export const canManageDeliveries = (user) => hasPermission(user.role, "delivery:manage", user.permissions);
export const canReadAnyDelivery = (user) => hasPermission(user.role, "delivery:read:any", user.permissions);

// True for: the assigned staff member, the booking's owning customer, anyone
// with delivery:read:any (admin/superadmin), or the workshop-admin who
// manages this delivery's workshop.
export const canViewDelivery = async (user, delivery, booking) => {
  if (delivery.staff && delivery.staff.equals(user._id)) return true;
  if (booking.user.equals(user._id)) return true;
  if (canReadAnyDelivery(user)) return true;
  if (user.role === "workshop-admin") {
    const workshop = await Workshop.findById(delivery.workshop).select("managedBy");
    return !!workshop?.managedBy?.equals(user._id);
  }
  return false;
};
