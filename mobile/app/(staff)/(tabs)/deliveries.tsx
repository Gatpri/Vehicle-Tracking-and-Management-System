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
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const stopSharing = () => {
    watcher.current?.remove();
    watcher.current = null;
    setSharingId(null);
  };

  const startSharing = async (delivery: DeliveryRow) => {
    // Foreground permission is the minimum; background is what keeps the track
    // alive once the rider pockets the phone. Asking for background without
    // foreground first is rejected outright on both platforms.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      Alert.alert(
        "Location needed",
        "Your location is shared while a delivery is under way so the customer can track their vehicle."
      );
      return;
    }
    // Declining background is not fatal — sharing still works while the app is
    // open, so this is a nudge rather than a blocker.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

    watcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        // A push every 10 metres or 5 seconds — frequent enough to look live,
        // sparse enough not to flood the socket or the battery.
        distanceInterval: 10,
        timeInterval: 5000,
      },
      (pos) => {
        getSocket().emit("delivery:push", {
          deliveryId: delivery._id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ?? undefined,
          // The device compass, which the web version had to request through a
          // separate permission-gated API. Here it arrives with the fix.
          heading: pos.coords.heading ?? undefined,
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
                  {sharing
                    ? "Sharing your location — the customer can see you moving."
                    : "Starting location sharing…"}
                </Text>
              </View>
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
