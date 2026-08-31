/**
 * Where a delivery leg is currently headed.
 *
 * A byte-for-byte port of the web app's src/lib/deliveryDestination.ts. Both
 * clients read the same statuses off the same documents, so they must agree on
 * where the rider is going — a difference here would send the rider one way
 * while the customer watched a route drawn to somewhere else.
 *
 * The rule the web version was written to fix: the earlier code special-cased
 * only the outbound pickup and fell through to the workshop for everything
 * else, which on the RETURN leg pointed the route at the place the rider had
 * just left.
 *
 *   pickup leg   assigned / en_route_to_pickup   -> the customer
 *                en_route_to_workshop            -> the workshop
 *   return leg   en_route_to_dropoff             -> the customer
 *                (anything else)                 -> nowhere
 *
 * Statuses that are not "en route" have no destination at all: the vehicle is
 * stationary, and a route line would imply movement that is not happening.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DestinationLike {
  leg: "pickup" | "return";
  status: string;
  customerLocation?: { lat: number; lng: number; address?: string } | null;
  /**
   * Accepts a bare id as well as the populated document: some endpoints return
   * the ref unpopulated, and a string silently has no `.location`, which would
   * leave the map with no destination and no clue why.
   */
  workshop?: { name?: string; location?: { lat: number; lng: number } | null } | string | null;
}

const TOWARD_CUSTOMER_ON_PICKUP = ["assigned", "en_route_to_pickup"];

const isLatLng = (v: { lat?: number; lng?: number } | null | undefined): v is LatLng =>
  !!v && typeof v.lat === "number" && typeof v.lng === "number";

/** The point the rider is driving toward, or undefined when not en route. */
export const destinationFor = (d: DestinationLike): LatLng | undefined => {
  const customer = isLatLng(d.customerLocation)
    ? { lat: d.customerLocation.lat, lng: d.customerLocation.lng }
    : undefined;
  const shop = typeof d.workshop === "string" ? null : d.workshop;
  const workshop = isLatLng(shop?.location) ? { lat: shop!.location!.lat, lng: shop!.location!.lng } : undefined;

  if (d.leg === "pickup") {
    return TOWARD_CUSTOMER_ON_PICKUP.includes(d.status)
      ? customer
      : d.status === "en_route_to_workshop"
      ? workshop
      : undefined;
  }
  return d.status === "en_route_to_dropoff" ? customer : undefined;
};

/** The same target with a human label, for a map pin. */
export const destinationWithLabel = (d: DestinationLike): (LatLng & { label: string }) | undefined => {
  const point = destinationFor(d);
  if (!point) return undefined;
  const headingToCustomer =
    (d.leg === "pickup" && TOWARD_CUSTOMER_ON_PICKUP.includes(d.status)) || d.status === "en_route_to_dropoff";
  const shop = typeof d.workshop === "string" ? null : d.workshop;
  return {
    ...point,
    label: headingToCustomer
      ? d.leg === "pickup"
        ? "Pickup point"
        : "Customer — drop-off"
      : shop?.name ?? "Workshop",
  };
};
