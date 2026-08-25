/**
 * Mirrors the server-side transition maps in deliveryController.js, and is a
 * direct port of the same constants in the web app's DeliveryDashboardPage.
 *
 * Used only to derive the single "next step" button — the server is the real
 * gate and rejects anything out of order.
 */
export type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "en_route_to_pickup"
  | "picked_up"
  | "en_route_to_workshop"
  | "at_workshop"
  | "en_route_to_dropoff"
  | "delivered"
  | "cancelled";

export const PICKUP_LEG_NEXT: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string }>> = {
  assigned: { next: "en_route_to_pickup", label: "Go out for delivery" },
  en_route_to_pickup: { next: "picked_up", label: "Mark picked up" },
  picked_up: { next: "en_route_to_workshop", label: "Start heading to workshop" },
  en_route_to_workshop: { next: "at_workshop", label: "Mark dropped at workshop" },
};

export const RETURN_LEG_NEXT: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string }>> = {
  assigned: { next: "en_route_to_dropoff", label: "Go out for delivery" },
  en_route_to_dropoff: { next: "delivered", label: "Mark delivered" },
};

/**
 * Every status where location sharing is actually live. Kept in sync with the
 * backend's EN_ROUTE_STATUSES (deliveryController.js, deliveryHandlers.js),
 * including "en_route_to_workshop" — the leg from pickup to the shop.
 */
export const EN_ROUTE: DeliveryStatus[] = [
  "en_route_to_pickup",
  "en_route_to_workshop",
  "en_route_to_dropoff",
];

export const nextStepFor = (
  leg: "pickup" | "return",
  status: DeliveryStatus
): { next: DeliveryStatus; label: string } | undefined =>
  (leg === "pickup" ? PICKUP_LEG_NEXT : RETURN_LEG_NEXT)[status];

export const isEnRoute = (status?: string): boolean =>
  EN_ROUTE.includes(status as DeliveryStatus);
