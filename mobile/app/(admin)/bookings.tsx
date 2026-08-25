import { useState } from "react";
import { Alert, View, StyleSheet } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { statusLabel, BOOKING_STATUS, isFinished, canSeePartsEstimate } from "../../src/lib/bookingWorkflow";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { PartsQuotePanel } from "../../src/components/PartsQuotePanel";
import { Badge, Button, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatMoney, formatDate, vehicleLabel, type Booking } from "../../src/lib/types";

/**
 * Ported from the web app's AdminBookingsPage.tsx — the workshop-side booking
 * queue.
 *
 * The status transitions are exactly the web page's: accept, start, request
 * payment, complete. Which are offered depends on the current status, using
 * the shared bookingWorkflow constants so the two clients cannot disagree
 * about what comes next.
 *
 * Scoping is the server's job: a workshop-admin calling /bookings gets only
 * their own garage's bookings back, so there is no filtering to repeat here.
 */
export default function AdminBookingsScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = hasPermission(user?.role, "booking:manage", user?.permissions ?? []);

  const act = async (id: string, action: string, label: string, reload: () => void) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/${action}`);
      reload();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert(`Could not ${label}`, getErrorMessage(err, "Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminList<Booking>
      title="Bookings"
      subtitle="Jobs booked into your workshops."
      path="/bookings"
      select={(d) => d.bookings ?? []}
      keyExtractor={(b) => b._id}
      emptyMessage="No bookings yet."
      refreshKey={refreshKey}
      renderItem={(b, reload) => {
        const busy = busyId === b._id;
        const price = b.finalPrice ?? b.quotedPrice ?? 0;

        return (
          <ListRow
            title={b.serviceType}
            subtitle={vehicleLabel(typeof b.vehicle === "object" ? b.vehicle : undefined)}
            trailing={<Badge status={statusLabel(b.status)} />}
          >
            <Row label="Booked" value={formatDate(b.createdAt)} />
            {typeof b.user === "object" && b.user ? (
              <Row label="Customer" value={`${b.user.firstname ?? ""} ${b.user.lastname ?? ""}`.trim() || b.user.email} />
            ) : null}
            {price ? <Row label="Amount" value={formatMoney(price)} /> : null}
            {b.deliveryRequested ? <Row label="Delivery" value="Requested" /> : null}

            {/* Parts estimation — the workshop side of the same negotiation.
                Hidden once paid, matching the web page: there is nothing left
                to agree on after the bill is settled. */}
            {canManage && canSeePartsEstimate(b) && b.paymentStatus !== "paid" ? (
              <View style={styles.quote}>
                <PartsQuotePanel bookingId={b._id} side="workshop" />
              </View>
            ) : null}

            {canManage && !isFinished(b.status) ? (
              <View style={styles.actions}>
                {b.status === BOOKING_STATUS.PENDING ? (
                  <Button title="Accept" small loading={busy} onPress={() => act(b._id, "accept", "accept", reload)} />
                ) : null}
                {b.status === BOOKING_STATUS.ACCEPTED || b.status === BOOKING_STATUS.DROPPED ? (
                  <Button
                    title="Start work"
                    small
                    variant="orange"
                    loading={busy}
                    onPress={() => act(b._id, "start", "start this job", reload)}
                  />
                ) : null}
                {b.status === BOOKING_STATUS.SERVICING_STARTED ||
                b.status === BOOKING_STATUS.ESTIMATION_CONFIRMED ? (
                  <Button
                    title="Request payment"
                    small
                    variant="orange"
                    loading={busy}
                    onPress={() => act(b._id, "request-payment", "request payment", reload)}
                  />
                ) : null}
                {b.status === BOOKING_STATUS.PAYMENT_COMPLETED ? (
                  <Button
                    title="Mark complete"
                    small
                    loading={busy}
                    onPress={() => act(b._id, "complete", "complete this job", reload)}
                  />
                ) : null}
              </View>
            ) : null}
          </ListRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  quote: { marginTop: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
