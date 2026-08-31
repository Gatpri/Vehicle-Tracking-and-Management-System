import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import api from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { getSocket, subscribeWithReconnect } from "../../../src/lib/socket";
import { isEnRoute } from "../../../src/lib/deliveryWorkflow";
import { legStatusLabel } from "../../../src/lib/bookingWorkflow";
import { Map, type MapPoint } from "../../../src/components/Map";
import { Screen, Card, Heading, Muted, Loading, ErrorNote, Empty, Row } from "../../../src/components/ui";
import { colors } from "../../../src/theme";
import { formatDateTime, type LocationPoint, type Delivery } from "../../../src/lib/types";

/**
 * Where the vehicle is now, and where it has been.
 *
 * Two separate live sources feed this screen, and an earlier version listened
 * for the wrong one:
 *
 *   "tracking:update" — the vehicle's own tracker, per vehicle.
 *   "delivery:update" — a delivery-staff member's phone while they are
 *                       carrying the vehicle, broadcast to `booking:<id>`.
 *
 * During a pickup or a return leg the second is the only thing moving, and
 * receiving it requires emitting "delivery:subscribe" first — a listener alone
 * puts you in no room, which is why the map sat still while the driver was
 * genuinely en route.
 */
type DeliveryRow = Delivery & { leg: "pickup" | "return" };

export default function TrackingScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const [live, setLive] = useState<LocationPoint | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryRow | null>(null);
  // Drives the marker glyph: a customer watching their own car should see a
  // car, not a generic dot. Mirrors the web app's LiveDeliveryMap.
  const [vehicleType, setVehicleType] = useState<string | null>(null);

  const history = useApi<LocationPoint[]>(
    vehicleId ? `/tracking/${vehicleId}/history` : null,
    (d) => d.history ?? d.locations ?? [],
    "Could not load the location history."
  );
  const latest = useApi<LocationPoint | null>(
    vehicleId ? `/tracking/${vehicleId}/latest` : null,
    (d) => d.location ?? null,
    "Could not load the latest position."
  );

  /**
   * Find the delivery currently carrying this vehicle, if any.
   *
   * Routed through the customer's own bookings rather than /deliveries/mine —
   * that endpoint filters by `staff`, so it returns nothing at all for a
   * customer. /deliveries/booking/:id authorises the booking's owner, which is
   * exactly who is looking at this screen.
   */
  const findActiveDelivery = useCallback(async () => {
    if (!vehicleId) return;

    try {
      const bookingRes = await api.get("/bookings/mine");
      const bookings: { _id: string; vehicle?: unknown }[] = bookingRes.data.bookings ?? [];

      const forVehicle = bookings.filter((b) => {
        const id = typeof b.vehicle === "object" ? (b.vehicle as { _id?: string })?._id : b.vehicle;
        return String(id) === String(vehicleId);
      });

      const populated = forVehicle.find((b) => typeof b.vehicle === "object");
      if (populated) {
        setVehicleType((populated.vehicle as { vehicleType?: string })?.vehicleType ?? null);
      }

      // Newest first, so an in-flight leg is found before older history.
      for (const booking of forVehicle) {
        const res = await api.get(`/deliveries/booking/${booking._id}`);
        const rows: DeliveryRow[] = res.data.deliveries ?? [];
        // isEnRoute covers BOTH legs — en_route_to_pickup and
        // en_route_to_workshop on the way in, en_route_to_dropoff on the way
        // back — so the return journey is found by the same search.
        const match = rows.find((d) => isEnRoute(d.status));
        if (match) {
          setActiveDelivery(match);
          return;
        }
      }
      setActiveDelivery(null);
    } catch {
      // No delivery in flight is the normal case; the vehicle's own tracker
      // still drives the map.
    }
  }, [vehicleId]);

  useEffect(() => {
    findActiveDelivery();
  }, [findActiveDelivery]);

  /**
   * Re-check when a delivery changes state.
   *
   * Without this the lookup ran once on mount, so a return leg that started
   * while the customer already had this screen open was never picked up — the
   * map simply stayed still. "delivery:status" and "delivery:assigned" are
   * what the backend emits as a leg moves, and a notification covers the rest.
   */
  useEffect(() => {
    const socket = getSocket();
    const recheck = () => findActiveDelivery();
    socket.on("delivery:status", recheck);
    socket.on("delivery:assigned", recheck);
    socket.on("notification:new", recheck);
    return () => {
      socket.off("delivery:status", recheck);
      socket.off("delivery:assigned", recheck);
      socket.off("notification:new", recheck);
    };
  }, [findActiveDelivery]);

  // Join the delivery's booking room. Without this the "delivery:update"
  // broadcasts never arrive — the server sends them to `booking:<id>` only.
  useEffect(() => {
    if (!activeDelivery?._id) return;
    return subscribeWithReconnect("delivery:subscribe", activeDelivery._id);
  }, [activeDelivery?._id]);

  useEffect(() => {
    if (!vehicleId) return;
    const socket = getSocket();

    // The vehicle's own tracker.
    const onTracking = (payload: { vehicleId?: string; location?: LocationPoint }) => {
      if (payload?.vehicleId && payload.vehicleId !== vehicleId) return;
      if (payload?.location) setLive(payload.location);
    };

    // The delivery rider's phone. The payload IS the point (a
    // DeliveryLocationHistory document), not a wrapper around one.
    const onDelivery = (point: LocationPoint) => {
      if (point?.lat != null && point?.lng != null) setLive(point);
    };

    socket.on("tracking:update", onTracking);
    socket.on("delivery:update", onDelivery);
    return () => {
      socket.off("tracking:update", onTracking);
      socket.off("delivery:update", onDelivery);
    };
  }, [vehicleId]);

  // A socket update is fresher than anything fetched, so it wins when present.
  const current = live ?? latest.data;

  const asPoint = (p?: LocationPoint | null): { lat: number; lng: number } | null => {
    if (!p) return null;
    // Records come back either as flat lat/lng or GeoJSON [lng, lat] depending
    // on the route, so both are handled rather than assuming one.
    if (typeof p.lat === "number" && typeof p.lng === "number") return { lat: p.lat, lng: p.lng };
    if (p.coordinates?.length === 2) return { lat: p.coordinates[1], lng: p.coordinates[0] };
    return null;
  };

  const track = (history.data ?? []).map(asPoint).filter(Boolean) as { lat: number; lng: number }[];
  const currentPoint = asPoint(current);

  const markers: MapPoint[] = currentPoint
    ? [
        {
          ...currentPoint,
          title: activeDelivery ? "Your vehicle" : "Current position",
          color: activeDelivery ? colors.orange500 : colors.blue700,
          // Only while a rider is carrying it: the glyph plus its heading
          // arrow means "this is moving", which is exactly what is not true
          // of a parked vehicle reporting its own position.
          ...(activeDelivery
            ? { kind: (vehicleType ?? "car") as MapPoint["kind"], heading: current?.heading ?? null }
            : {}),
        },
      ]
    : [];

  if (history.loading || latest.loading) return <Loading label="Loading tracking…" />;

  return (
    <Screen
      refreshing={history.refreshing}
      onRefresh={() => {
        history.refresh();
        latest.refresh();
      }}
    >
      <Heading>Live tracking</Heading>

      {activeDelivery ? (
        <Muted>
          {`Your vehicle is with a delivery rider — ${legStatusLabel(activeDelivery.leg, activeDelivery.status)}.`}
        </Muted>
      ) : null}

      {history.error ? <ErrorNote message={history.error} onRetry={history.reload} /> : null}

      {currentPoint || track.length > 0 ? (
        <View style={styles.mapWrap}>
          <Map points={markers} path={track} title="Live tracking" />
        </View>
      ) : (
        <Empty message="No location has been recorded for this vehicle yet." />
      )}

      {current ? (
        <Card>
          <Heading level={2}>Latest fix</Heading>
          {currentPoint ? (
            <Row label="Position" value={`${currentPoint.lat.toFixed(5)}, ${currentPoint.lng.toFixed(5)}`} />
          ) : null}
          <Row label="Recorded" value={formatDateTime(current.recordedAt || current.createdAt)} />
          {live ? <Muted>Updating live.</Muted> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: { overflow: "hidden" },
});
