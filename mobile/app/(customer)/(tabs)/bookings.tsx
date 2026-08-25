import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import api, { getErrorMessage } from "../../../src/lib/api";
import { useApi } from "../../../src/lib/useApi";
import { openEsewaCheckout } from "../../../src/lib/esewa";
import {
  customerStatusLabel,
  canTrackDelivery,
  canSeePartsEstimate,
  canCustomerCancel,
  BOOKING_STATUS,
} from "../../../src/lib/bookingWorkflow";
import { PartsQuotePanel } from "../../../src/components/PartsQuotePanel";
import { Screen, Card, Heading, Muted, Button, Badge, Loading, ErrorNote, Empty, Row } from "../../../src/components/ui";
import { colors, radius, spacing } from "../../../src/theme";
import { formatMoney, formatDate, vehicleLabel, type Booking, type WalletInfo } from "../../../src/lib/types";

/**
 * Ported from the web app's BookingsPage.tsx.
 *
 * The workflow logic is shared rather than reimplemented — customerStatusLabel,
 * canTrackDelivery and isFinished all come from the same bookingWorkflow module
 * the web app uses, so the two clients cannot drift on what a status means.
 *
 * The one genuinely different piece is eSewa payment: the web redirects the
 * whole page to eSewa's checkout, while here it opens in an in-app browser
 * (see src/lib/esewa.ts). Everything else — pay from wallet, request pickup,
 * cancel — is the same request as the web version.
 */
export default function BookingsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");
  const [actingId, setActingId] = useState<string | null>(null);

  const path = filter ? `/bookings/mine?status=${filter}` : "/bookings/mine";
  const { data, loading, refreshing, error, refresh, reload } = useApi<Booking[]>(
    path,
    (d) => d.bookings ?? [],
    "Could not load your bookings."
  );
  const wallet = useApi<WalletInfo | null>("/wallet", (d) => d.wallet ?? null, "Could not load your wallet.");

  const payFromWallet = async (id: string) => {
    setActingId(id);
    try {
      await api.post("/wallet/pay-booking", { bookingId: id });
      Alert.alert("Paid", "The booking has been paid from your wallet.");
      wallet.reload();
      reload();
    } catch (err) {
      Alert.alert("Payment failed", getErrorMessage(err, "Could not pay from your wallet."));
    } finally {
      setActingId(null);
    }
  };

  const payWithEsewa = async (id: string) => {
    setActingId(id);
    try {
      const res = await api.post("/wallet/pay-booking/esewa", { bookingId: id });
      await openEsewaCheckout(res.data.url, res.data.fields);
      // The in-app browser has closed, but that is not proof the payment went
      // through — eSewa calls the backend directly. Refetching is how the app
      // learns the real outcome.
      reload();
      wallet.reload();
    } catch (err) {
      Alert.alert("Could not start payment", getErrorMessage(err, "Please try again."));
    } finally {
      setActingId(null);
    }
  };

  const choosePayment = (b: Booking) => {
    const due = b.finalPrice ?? b.quotedPrice ?? 0;
    Alert.alert(
      "Pay for this booking",
      `Amount due: ${formatMoney(due)}`,
      [
        { text: `Wallet (${formatMoney(wallet.data?.balance)})`, onPress: () => payFromWallet(b._id) },
        { text: "eSewa", onPress: () => payWithEsewa(b._id) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const requestPickup = async (id: string) => {
    setActingId(id);
    try {
      await api.patch(`/bookings/${id}/request-delivery`);
      Alert.alert("Pickup requested", "A delivery admin will assign a staff member soon.");
      reload();
    } catch (err) {
      Alert.alert("Could not request pickup", getErrorMessage(err, "Please try again."));
    } finally {
      setActingId(null);
    }
  };

  const cancelBooking = (id: string) => {
    // Destructive and not undoable, so it asks first — the web page had the
    // same confirm step.
    Alert.alert("Cancel this booking?", "This cannot be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel booking",
        style: "destructive",
        onPress: async () => {
          setActingId(id);
          try {
            await api.patch(`/bookings/${id}/cancel`);
            reload();
          } catch (err) {
            Alert.alert("Could not cancel", getErrorMessage(err, "Please try again."));
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  const filters = [
    { key: "", label: "All" },
    { key: BOOKING_STATUS.PENDING, label: "Pending" },
    { key: BOOKING_STATUS.PAYMENT_PENDING, label: "To pay" },
    { key: BOOKING_STATUS.COMPLETED, label: "Completed" },
  ];

  if (loading) return <Loading label="Loading your bookings…" />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Heading>Your bookings</Heading>

      <View style={styles.filters}>
        {filters.map((f) => (
          <Pressable key={f.key || "all"} onPress={() => setFilter(f.key)}>
            <View style={[styles.chip, filter === f.key && styles.chipOn]}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!error && (data ?? []).length === 0 ? <Empty message="No bookings to show." /> : null}

      {(data ?? []).map((b) => {
        const busy = actingId === b._id;
        const due = b.finalPrice ?? b.quotedPrice ?? 0;
        const awaitingPayment = b.status === BOOKING_STATUS.PAYMENT_PENDING;
        // Pickup can only be called for once the workshop has accepted, and
        // only when delivery was chosen at booking time.
        const canRequestPickup = b.deliveryRequested && b.status === BOOKING_STATUS.ACCEPTED;

        return (
          <Card key={b._id}>
            <View style={styles.head}>
              <View style={styles.headMain}>
                <Text style={styles.title}>{b.serviceType}</Text>
                <Muted>{vehicleLabel(typeof b.vehicle === "object" ? b.vehicle : undefined)}</Muted>
              </View>
              <Badge status={customerStatusLabel(b.status)} />
            </View>

            <Row label="Booked" value={formatDate(b.createdAt)} />
            {typeof b.workshop === "object" && b.workshop?.name ? (
              <Row label="Workshop" value={b.workshop.name} />
            ) : null}
            {due ? <Row label="Amount" value={formatMoney(due)} /> : null}
            {b.isOverpriced ? (
              <Text style={styles.warn}>
                This estimate is unusually high compared with similar jobs.
              </Text>
            ) : null}

            {/* Parts estimation, the same negotiation the web app runs. Only
                shown once the workshop actually has the vehicle open — see
                canSeePartsEstimate in bookingWorkflow.ts. */}
            {canSeePartsEstimate(b) ? (
              <View style={styles.quote}>
                <PartsQuotePanel bookingId={b._id} side="customer" />
              </View>
            ) : null}

            <View style={styles.actions}>
              {awaitingPayment ? (
                <Button title="Pay now" small onPress={() => choosePayment(b)} loading={busy} />
              ) : null}
              {canRequestPickup ? (
                <Button title="Request pickup" variant="orange" small onPress={() => requestPickup(b._id)} loading={busy} />
              ) : null}
              {canTrackDelivery(b) ? (
                <Button
                  title="Track"
                  variant="outline"
                  small
                  onPress={() =>
                    router.push(
                      `/(customer)/tracking/${typeof b.vehicle === "object" ? b.vehicle?._id : b.vehicle}`
                    )
                  }
                />
              ) : null}
              {/* Gone once the workshop has started work — at that point parts
                  may already be off the vehicle, and the backend refuses the
                  cancel anyway. */}
              {canCustomerCancel(b.status) ? (
                <Button title="Cancel" variant="ghost" small onPress={() => cancelBooking(b._id)} disabled={busy} />
              ) : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.navy900, borderColor: colors.navy900 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  headMain: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 16 },
  quote: { marginTop: spacing.md },
  warn: { color: colors.orange600, fontSize: 13, marginTop: spacing.sm, fontWeight: "500" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
