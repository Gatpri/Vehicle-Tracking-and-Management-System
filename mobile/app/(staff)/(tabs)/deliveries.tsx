import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { getSocket } from "../../../src/lib/socket";
import { legStatusLabel } from "../../../src/lib/bookingWorkflow";
import { nextStepFor, isEnRoute, type DeliveryStatus } from "../../../src/lib/deliveryWorkflow";
import { Screen, Card, Heading, Muted, Button, Badge, Loading, ErrorNote, Empty, Row } from "../../../src/components/ui";
import { colors, spacing } from "../../../src/theme";
import { RiderNavMap } from "../../../src/components/RiderNavMap";
import { destinationWithLabel } from "../../../src/lib/deliveryDestination";
import { vehicleLabel, type Delivery } from "../../../src/lib/types";

/**
 * Ported from the web app's DeliveryDashboardPage.tsx.
 *
 * This is the screen the native rewrite most improves. The web version shared
 * location with navigator.geolocation.watchPosition, which stops the moment
 * the browser tab is backgrounded or the phone locks — precisely what happens
 * when someone actually starts riding. expo-location keeps a foreground
 * service running on Android with a persistent notification, so the track
 * continues while the app is in the background and the screen is off.
 *
 * The wire format is unchanged: the same "delivery:push" event with the same
 * fields, so the customer's tracking screen and the admin board work as before.
 */
type DeliveryRow = Delivery & { leg: "pickup" | "return" };

export default function StaffDeliveriesScreen() {
  const { data, loading, refreshing, error, refresh, reload, setData } = useApi<DeliveryRow[]>(
    "/deliveries/mine",
    (d) => d.deliveries ?? [],
    "Could not load your deliveries."
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  // The rider's own latest fix, mirrored from the GPS watch below so the map
  // can draw it. Deliberately fed from the SAME watch that pushes to the
  // server — a second watchPositionAsync would double the battery cost and
  // compete with the first for fixes.
  const [myPosition, setMyPosition] = useState<{ lat: number; lng: number; heading?: number | null } | null>(null);
  // Set when the rider denies (or has previously denied) location. Without
  // this the only feedback was a one-shot Alert: dismiss it and the screen
  // looked identical to a working one, with the map silently never filling in.
  const [locationDenied, setLocationDenied] = useState(false);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  // The device compass, watched separately from position.
  //
  // pos.coords.heading is GPS *course* — the direction of travel — which the
  // OS reports as -1 or null while stationary or moving slowly, so the arrow
  // froze at a stop and pointed nowhere when the rider was walking the vehicle.
  // watchHeadingAsync reads the magnetometer instead, so the arrow follows
  // wherever the phone is physically pointed, moving or not.
  const compass = useRef<Location.LocationSubscription | null>(null);
  // Held in a ref as well as state: the position callback needs the newest
  // value without re-subscribing every time the rider turns.
  const headingRef = useRef<number | null>(null);

  const stopSharing = () => {
    watcher.current?.remove();
    watcher.current = null;
    compass.current?.remove();
    compass.current = null;
    headingRef.current = null;
    setSharingId(null);
    setMyPosition(null);
  };

  const startSharing = async (delivery: DeliveryRow) => {
    // Foreground permission is the minimum; background is what keeps the track
    // alive once the rider pockets the phone. Asking for background without
    // foreground first is rejected outright on both platforms.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      setLocationDenied(true);
      Alert.alert(
        "Location needed",
        "Your location is shared while a delivery is under way so the customer can track their vehicle."
      );
      return;
    }
    // Declining background is not fatal — sharing still works while the app is
    // open, so this is a nudge rather than a blocker.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

    setLocationDenied(false);

    // Compass first, so the arrow has a direction before the first GPS fix.
    // trueHeading needs location permission (granted above) and comes back as
    // -1 when unavailable; magHeading is the magnetic fallback. A phone with
    // no magnetometer simply never fires this, and the arrow falls back to
    // GPS course, so this is wrapped rather than allowed to break sharing.
    try {
      compass.current = await Location.watchHeadingAsync((h) => {
        const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (typeof deg !== "number" || deg < 0) return;
        headingRef.current = deg;

        // Ignore changes under 5°.
        //
        // The magnetometer reports many times a second and drifts a degree or
        // two even lying still, so forwarding every reading would re-render the
        // screen continuously and make the arrow twitch in place. 5° is small
        // enough that turning feels continuous and large enough to sit above
        // the sensor noise — and each accepted step remounts the marker to
        // apply the rotation, so the threshold is what keeps that cheap.
        setMyPosition((prev) => {
          if (!prev) return prev;
          const prevDeg = prev.heading;
          if (typeof prevDeg === "number") {
            // Shortest angular distance, so 359° -> 1° counts as 2°, not 358°.
            const diff = Math.abs(((deg - prevDeg + 540) % 360) - 180);
            if (diff < 5) return prev;
          }
          return { ...prev, heading: deg };
        });
      });
    } catch {
      // No compass on this device — GPS course still drives the arrow.
    }

    watcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        // A push every 10 metres or 5 seconds — frequent enough to look live,
        // sparse enough not to flood the socket or the battery.
        distanceInterval: 10,
        timeInterval: 5000,
      },
      (pos) => {
        // Compass first: it reflects where the phone is pointed even at a
        // standstill, which GPS course cannot do.
        const heading =
          headingRef.current ??
          (typeof pos.coords.heading === "number" && pos.coords.heading >= 0 ? pos.coords.heading : null);
        setMyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, heading });
        getSocket().emit("delivery:push", {
          deliveryId: delivery._id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ?? undefined,
          // Sent so everyone watching sees the vehicle marker point the right
          // way too — the same field the web app's LiveDeliveryMap prefers
          // over its own travel-direction estimate.
          heading: heading ?? undefined,
        });
      }
    );
    setSharingId(delivery._id);
  };

  /**
   * Location sharing follows the delivery's own status — there is no button.
   *
   * A driver who is en route is, by definition, delivering; asking them to
   * remember a toggle meant a customer watching the map saw nothing while the
   * vehicle was genuinely moving. The server already accepts pushes for
   * exactly these statuses (EN_ROUTE_STATUSES in deliveryHandlers.js), so
   * driving the client from the same rule keeps the two in step.
   *
   * It starts again on its own for the return leg, because that leg passes
   * through en_route_to_dropoff just as the pickup passes through
   * en_route_to_pickup.
   */
  const enRouteDelivery = (data ?? []).find((d) => isEnRoute(d.status));

  useEffect(() => {
    if (enRouteDelivery) {
      // Already watching this one — leave the existing subscription alone
      // rather than tearing it down and re-acquiring a fix.
      if (sharingId === enRouteDelivery._id) return;
      stopSharing();
      startSharing(enRouteDelivery);
      return;
    }
    // Nothing is en route: at_workshop, delivered, or awaiting the next step.
    // Keeping the GPS watch alive here would drain the battery for nobody.
    if (sharingId) stopSharing();
    // startSharing is stable enough for this purpose and depending on it would
    // retrigger the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enRouteDelivery?._id, enRouteDelivery?.status]);

  // Never leave a GPS watch running after the screen goes away — it would keep
  // draining the battery with nothing listening.
  useEffect(() => stopSharing, []);

  const advance = async (delivery: DeliveryRow) => {
    const step = nextStepFor(delivery.leg, delivery.status as DeliveryStatus);
    if (!step) return;

    setBusyId(delivery._id);
    try {
      const res = await api.patch(`/deliveries/${delivery._id}/status`, { status: step.next });
      const updated: DeliveryRow = res.data.delivery;
      setData((prev) => (prev ?? []).map((d) => (d._id === updated._id ? { ...d, ...updated } : d)));

      // Once a leg stops being "en route" there is nothing left to track, so
      // the watch is torn down rather than left running to the end of the day.
      // No explicit stopSharing here: the effect above watches the status and
      // tears the GPS watch down when nothing is en route any more. Doing it
      // in both places would race — this one runs before the state update, so
      // the effect would immediately restart what this had just stopped.
    } catch (err) {
      Alert.alert("Could not update", getErrorMessage(err, "Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loading label="Loading your deliveries…" />;

  const active = (data ?? []).filter((d) => !["delivered", "at_workshop", "cancelled"].includes(d.status));
  const done = (data ?? []).filter((d) => ["delivered", "at_workshop", "cancelled"].includes(d.status));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Heading>Your deliveries</Heading>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!error && (data ?? []).length === 0 ? <Empty message="Nothing assigned to you right now." /> : null}

      {active.map((d) => {
        const step = nextStepFor(d.leg, d.status as DeliveryStatus);
        const enRoute = isEnRoute(d.status);
        const sharing = sharingId === d._id;

        return (
          <Card key={d._id}>
            <View style={styles.head}>
              <View style={styles.main}>
                <Text style={styles.title}>
                  {d.leg === "pickup" ? "Collect from customer" : "Return to customer"}
                </Text>
                <Muted>
                  {vehicleLabel(
                    typeof d.booking === "object" && typeof d.booking?.vehicle === "object"
                      ? d.booking.vehicle
                      : undefined
                  )}
                </Muted>
              </View>
              <Badge status={legStatusLabel(d.leg, d.status)} />
            </View>

            {d.pickupAddress ? <Row label="Pick up" value={d.pickupAddress} /> : null}
            {d.dropoffAddress ? <Row label="Drop off" value={d.dropoffAddress} /> : null}

            {/* Status, not a control — sharing turns itself on and off with
                the delivery's own status. */}
            {enRoute ? (
              <View style={sharing ? styles.sharingOn : styles.sharingOff}>
                <Text style={sharing ? styles.sharingOnText : styles.sharingOffText}>
                  {/* Three states, not two. "Starting…" was previously shown
                      for a denial as well, which reads as "wait a moment"
                      forever and hides the one thing the rider must act on. */}
                  {sharing
                    ? "Sharing your location — the customer can see you moving."
                    : locationDenied
                    ? "Location is off, so nobody can see this delivery moving. Enable location for this app, then tap Retry."
                    : "Starting location sharing…"}
                </Text>
                {locationDenied ? (
                  <Button title="Retry" small variant="outline" onPress={() => startSharing(d)} />
                ) : null}
              </View>
            ) : null}

            {/* The rider's own navigation view. Until this existed the app
                pushed a track the rider could not see: no route, no direction,
                no ETA.
                Gated on `enRoute` alone, NOT on `sharing`: sharing only turns
                true after two permission dialogs have been answered, so gating
                on it meant a rider who denied location — or who was simply
                waiting on the prompt — saw no map at all and no explanation.
                The map now appears with the destination and route immediately,
                and fills in the rider's own arrow once a fix arrives. */}
            {enRoute ? (
              <RiderNavMap
                position={myPosition}
                destination={destinationWithLabel(d)}
                status={d.status}
              />
            ) : null}

            <View style={styles.actions}>
              {step ? (
                <Button
                  title={step.label}
                  small
                  loading={busyId === d._id}
                  onPress={() => advance(d)}
                />
              ) : null}
            </View>
          </Card>
        );
      })}

      {done.length > 0 ? (
        <>
          <Heading level={2}>Finished</Heading>
          {done.map((d) => (
            <Card key={d._id}>
              <View style={styles.head}>
                <View style={styles.main}>
                  <Text style={styles.title}>
                    {d.leg === "pickup" ? "Collected" : "Returned"}
                  </Text>
                  <Muted>
                    {vehicleLabel(
                      typeof d.booking === "object" && typeof d.booking?.vehicle === "object"
                        ? d.booking.vehicle
                        : undefined
                    )}
                  </Muted>
                </View>
                <Badge status={legStatusLabel(d.leg, d.status)} />
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  sharingOn: { backgroundColor: "#ecfdf5", borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  sharingOnText: { color: colors.green500, fontWeight: "600", fontSize: 13 },
  sharingOff: { backgroundColor: colors.slate100, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  sharingOffText: { color: colors.slate600, fontSize: 13 },
});
