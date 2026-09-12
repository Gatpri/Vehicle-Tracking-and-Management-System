import { useEffect, useRef, useState } from "react";

/**
 * Road-following route and ETA between two points.
 *
 * Extracted from RiderNavMap, which had this inline. The customer tracking
 * screen needs exactly the same thing — a road path and an arrival time — and
 * a second copy of the fetch/throttle/cancel logic would be a second place for
 * it to drift.
 *
 * Uses OSRM's free public routing server: no API key, no new dependency, and
 * the same source the web app's LiveDeliveryMap already calls, so both clients
 * draw the identical road path for the same delivery.
 *
 * Deliberately fails quiet. A missing route line is survivable — the map still
 * shows where the vehicle is and where it is going — so an unreachable router
 * degrades the view rather than erroring the screen.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteEta {
  seconds: number;
  metres: number;
}

/**
 * How far the vehicle must move before the route is re-fetched, in km.
 *
 * Refetching on every GPS tick would hammer a shared public instance for a
 * path that barely changes over a few metres. 200m is a reasonable balance:
 * the line stays visually correct while the request rate stays polite.
 */
const REFETCH_AFTER_KM = 0.2;

/** Rough km between two points. Only used to decide "has it moved far enough
 *  to re-fetch" — never for anything the user sees. */
export const roughDistanceKm = (a: LatLng, b: LatLng): number => {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

export function useRoute(
  from: LatLng | null | undefined,
  to: LatLng | null | undefined
): { route: LatLng[]; eta: RouteEta | null } {
  const [route, setRoute] = useState<LatLng[]>([]);
  const [eta, setEta] = useState<RouteEta | null>(null);
  const lastRoutedFrom = useRef<LatLng | null>(null);

  useEffect(() => {
    if (!from || !to) {
      setRoute([]);
      setEta(null);
      lastRoutedFrom.current = null;
      return;
    }

    const movedEnough =
      !lastRoutedFrom.current || roughDistanceKm(lastRoutedFrom.current, from) > REFETCH_AFTER_KM;
    if (!movedEnough) return;

    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/` +
        `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const leg = data?.routes?.[0];
        const coords: [number, number][] | undefined = leg?.geometry?.coordinates;
        if (!coords) return;
        // OSRM returns [lng, lat]; every map component here wants {lat, lng}.
        setRoute(coords.map(([lng, lat]) => ({ lat, lng })));
        lastRoutedFrom.current = { lat: from.lat, lng: from.lng };
        if (typeof leg.duration === "number" && typeof leg.distance === "number") {
          setEta({ seconds: leg.duration, metres: leg.distance });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [from?.lat, from?.lng, to?.lat, to?.lng]);

  return { route, eta };
}

/* ---------------------------------------------------------------- formatting
 *
 * Kept beside the hook so every screen phrases an ETA the same way. A customer
 * comparing the app on their phone with the web view should not see "8 min"
 * in one place and "0.1 h" in the other.
 * -------------------------------------------------------------------------- */

/** "4 min" / "1 h 12 min". Never "0 min": under a minute reads as "arriving". */
export const formatDuration = (seconds: number): string => {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "arriving";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** "350 m" / "4.2 km". Rounded to 10m below a kilometre — GPS is not accurate
 *  enough for single metres, and showing them implies a precision we lack. */
export const formatDistance = (metres: number): string =>
  metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;

/** Clock time of arrival, e.g. "2:45 PM". */
export const formatArrival = (seconds: number): string =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
