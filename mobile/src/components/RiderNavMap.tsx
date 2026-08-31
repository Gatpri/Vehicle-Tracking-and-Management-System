import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Map, type MapPoint } from "./Map";
import { colors, radius, spacing } from "../theme";
import type { LatLng } from "../lib/deliveryDestination";

/**
 * The rider's own navigation view, for the staff deliveries screen.
 *
 * The mobile app already pushed the rider's position to the server, but showed
 * the rider nothing back — they were sharing a track they could not see, with
 * no route, no direction and no ETA. This is the counterpart to the web app's
 * LiveDeliveryMap in `viewer="rider"` mode, and it deliberately mirrors that
 * behaviour rather than inventing a second design:
 *
 *   - the rider is an arrow that rotates with the device compass, so "up" on
 *     screen is always the way they are facing;
 *   - the road ahead is a bright blue route line to the current destination;
 *   - the footer answers "how far, and when do I get there".
 *
 * The position comes from the GPS watch the screen already runs — this
 * component never starts a second one, which would double the battery cost and
 * fight the first for fixes.
 */

export interface RiderNavMapProps {
  /** Live position from the screen's existing Location.watchPositionAsync. */
  position: { lat: number; lng: number; heading?: number | null } | null;
  /** Where this leg is headed, from lib/deliveryDestination. */
  destination?: (LatLng & { label: string }) | null;
  /** Drives the instruction line — "Return to the customer", etc. */
  status: string;
}

/** The delivery states from the driver's seat: instructions, not narration. */
const RIDER_LEG_LABEL: Record<string, string> = {
  en_route_to_pickup: "Go to the customer",
  en_route_to_workshop: "Deliver to the workshop",
  en_route_to_dropoff: "Return to the customer",
};

/** 0° -> "N", 45° -> "NE", and so on. Eight points is what a rider can act on;
 *  sixteen would be false precision from a phone magnetometer. */
const compassPoint = (deg: number) => {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};

/** "3 min", "1 hr 5 min" — never raw seconds. */
const formatEta = (seconds: number) => {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

/** Metric — the fleet is in Nepal. */
const formatDistance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;

const formatArrival = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Rough km between two points — only used to decide "has the rider moved far
 *  enough to re-fetch the route", never for anything user-facing. */
const roughDistanceKm = (a: LatLng, b: LatLng) => {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

export function RiderNavMap({ position, destination, status }: RiderNavMapProps) {
  const [route, setRoute] = useState<{ lat: number; lng: number }[]>([]);
  const [eta, setEta] = useState<{ seconds: number; metres: number } | null>(null);
  const lastRoutedFrom = useRef<LatLng | null>(null);

  // Road-following route via OSRM's public server — the same source the web
  // app uses, so both show the same road path. Re-fetched only after the rider
  // has actually moved ~200m: refetching on every GPS tick would hammer a
  // shared public instance for a path that barely changes.
  useEffect(() => {
    if (!position || !destination) {
      setRoute([]);
      setEta(null);
      return;
    }
    const movedEnough = !lastRoutedFrom.current || roughDistanceKm(lastRoutedFrom.current, position) > 0.2;
    if (!movedEnough) return;

    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${position.lng},${position.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const leg = data?.routes?.[0];
        const coords: [number, number][] | undefined = leg?.geometry?.coordinates;
        if (!coords) return;
        setRoute(coords.map(([lng, lat]) => ({ lat, lng })));
        lastRoutedFrom.current = { lat: position.lat, lng: position.lng };
        if (typeof leg.duration === "number" && typeof leg.distance === "number") {
          setEta({ seconds: leg.duration, metres: leg.distance });
        }
      })
      // A missing route line is survivable; the rider still sees themselves and
      // the destination pin. Never surfaced as an error for that reason.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [position?.lat, position?.lng, destination?.lat, destination?.lng]);

  // Destination first when the rider has no fix yet, so the map has something
  // to centre on: Map centres on points[0], and an empty list renders a blank
  // grey block that looks like a broken component rather than "waiting for
  // GPS". Once a fix arrives the rider's own arrow leads.
  const points: MapPoint[] = [];
  if (position) {
    points.push({
      lat: position.lat,
      lng: position.lng,
      kind: "arrow",
      heading: position.heading ?? null,
      title: "You",
    });
  }
  if (destination) {
    points.push({ lat: destination.lat, lng: destination.lng, title: destination.label, color: colors.orange500 });
  }

  return (
    <View style={styles.wrap}>
      <Map
        points={points}
        route={route}
        followCoordinate={position}
        title={destination ? `Navigate — ${destination.label}` : "Navigation"}
        style={styles.map}
      />
      <View style={styles.bar}>
        <View style={styles.left}>
          {eta ? (
            <>
              <Text style={styles.eta}>{formatEta(eta.seconds)}</Text>
              <Text style={styles.sub}>
                {formatDistance(eta.metres)} · you arrive {formatArrival(eta.seconds)}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.etaPending}>{position ? "Live" : "—"}</Text>
              <Text style={styles.sub}>
                {position ? "Calculating route…" : "Waiting for a GPS fix…"}
              </Text>
            </>
          )}
        </View>
        <View style={styles.right}>
          <Text style={styles.leg} numberOfLines={2}>
            {RIDER_LEG_LABEL[status] ?? "In progress"}
          </Text>
          {/* The live compass reading, shown as a cardinal point and degrees.
              Kept visible rather than hidden behind a debug flag: a rider
              genuinely benefits from knowing which way they are pointed at a
              junction, and it doubles as the honest answer to "is the arrow
              actually tracking my phone?" — if this number does not move when
              the phone turns, the device is not reporting a heading and no
              amount of map code will rotate the arrow. */}
          <Text style={styles.compass}>
            {typeof position?.heading === "number"
              ? `${compassPoint(position.heading)} · ${Math.round(position.heading)}°`
              : "no compass"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  map: { height: 240, borderRadius: radius.md },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  left: { flexShrink: 1 },
  // Green reads as "on track" rather than as a warning — the same choice every
  // consumer navigation app makes.
  eta: { fontSize: 20, fontWeight: "700", color: colors.green500 },
  etaPending: { fontSize: 20, fontWeight: "700", color: colors.blue700 },
  sub: { fontSize: 12.5, color: colors.slate600, marginTop: 2 },
  right: { alignItems: "flex-end", flexShrink: 1 },
  leg: { fontSize: 13, fontWeight: "600", color: colors.navy900, textAlign: "right", flexShrink: 1 },
  compass: { fontSize: 11.5, color: colors.slate400, marginTop: 2 },
});

export default RiderNavMap;
