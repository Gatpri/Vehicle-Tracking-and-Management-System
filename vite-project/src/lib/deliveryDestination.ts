/**
 * Where a delivery leg is currently headed.
 *
 * This lived as three near-identical copies (BookingsPage, AdminDeliveriesPage,
 * DeliveryDashboardPage) and all three shared the same bug: they special-cased
 * only the outbound pickup and fell through to `workshop.location` for
 * everything else. On the RETURN leg that is exactly backwards — the rider is
 * bringing the vehicle back to the customer, so a route drawn to the workshop
 * points at the place they have just left, and the staff member's own screen
 * navigates them the wrong way.
 *
 * A delivery is two legs of two hops each:
 *
 *   pickup leg   assigned / en_route_to_pickup   -> the customer
 *                en_route_to_workshop            -> the workshop
 *   return leg   en_route_to_dropoff             -> the customer
 *                (anything else)                 -> the workshop
 *
 * Statuses that are not "en route" (picked_up, at_workshop, delivered) have no
 * destination at all: the vehicle is stationary and a route line would imply
 * movement that is not happening.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DestinationLike {
  leg: "pickup" | "return";
  status: string;
  customerLocation?: { lat: number; lng: number; address?: string } | null;
  workshop?: { name?: string; location?: { lat: number; lng: number } | null } | null;
}

/** Heading out to collect the vehicle — the target is the customer. */
const TOWARD_CUSTOMER_ON_PICKUP = ["assigned", "en_route_to_pickup"];

const isLatLng = (v: { lat?: number; lng?: number } | null | undefined): v is LatLng =>
  !!v && typeof v.lat === "number" && typeof v.lng === "number";

/**
 * The point the rider is driving toward right now, or `undefined` when they are
 * not en route (so callers draw pins without a misleading route line).
 */
export const destinationFor = (d: DestinationLike): LatLng | undefined => {
  const customer = isLatLng(d.customerLocation) ? { lat: d.customerLocation.lat, lng: d.customerLocation.lng } : undefined;
  const workshop = isLatLng(d.workshop?.location) ? { lat: d.workshop!.location!.lat, lng: d.workshop!.location!.lng } : undefined;

  if (d.leg === "pickup") {
    return TOWARD_CUSTOMER_ON_PICKUP.includes(d.status) ? customer : d.status === "en_route_to_workshop" ? workshop : undefined;
  }
  // Return leg: the whole point is to get the vehicle back to its owner.
  return d.status === "en_route_to_dropoff" ? customer : undefined;
};

/** The same target with a human label, for a map pin. */
export const destinationWithLabel = (d: DestinationLike): (LatLng & { label: string }) | undefined => {
  const point = destinationFor(d);
  if (!point) return undefined;
  const headingToCustomer =
    (d.leg === "pickup" && TOWARD_CUSTOMER_ON_PICKUP.includes(d.status)) || d.status === "en_route_to_dropoff";
  return {
    ...point,
    label: headingToCustomer
      ? d.leg === "pickup"
        ? "Pickup point"
        : "Customer — drop-off"
      : d.workshop?.name ?? "Workshop",
  };
};
