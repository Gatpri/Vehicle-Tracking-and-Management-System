import { useState } from "react";
import { Alert, View, StyleSheet } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { hasPermission } from "../../src/lib/permissions";
import { statusLabel, BOOKING_STATUS, isFinished, canSeePartsEstimate } from "../../src/lib/bookingWorkflow";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { PartsQuotePanel } from "../../src/components/PartsQuotePanel";
import { ReasonDialog } from "../../src/components/ReasonDialog";
import { BookingResolutionNote } from "../../src/components/BookingResolutionNote";
import { Badge, Button, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatMoney, formatDate, vehicleLabel, type Booking } from "../../src/lib/types";

/**
 * Ported from the web app's AdminBookingsPage.tsx — the workshop-side booking
 * queue.
 *
 * The status transitions are exactly the web page's: accept or reject, start,
 * request payment, complete. Which are offered depends on the current status,
 * using the shared bookingWorkflow constants so the two clients cannot
 * disagree about what comes next.
 *
 * Scoping is the server's job: a workshop-admin calling /bookings gets only
 * their own garage's bookings back, so there is no filtering to repeat here.
 */
export default function AdminBookingsScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = hasPermission(user?.role, "booking:manage", user?.permissions ?? []);

  // Rejecting needs a reason, so it can't go through `act` — it holds the
  // booking until the dialog returns one. The row's own `reload` is captured
  // alongside the id, because AdminList hands it per-row rather than once.
  const [rejecting, setRejecting] = useState<{ id: string; reload: () => void } | null>(null);

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

  const confirmReject = async (reason: string) => {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await api.patch(`/bookings/${rejecting.id}/reject`, { reason });
      rejecting.reload();
      setRejecting(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not reject", getErrorMessage(err, "Please try again."));
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

            {/* Why it stopped, if it did — the customer's cancellation reason,
                or the rejection this workshop itself sent. */}
            <BookingResolutionNote resolution={b.resolution} viewer="staff" />

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
                {/* The two answers to a pending request. Rejecting is only
                    offered here, matching the backend's transition map — once
                    accepted, backing out is a cancellation instead. */}
                {b.status === BOOKING_STATUS.PENDING ? (
                  <>
                    <Button title="Accept" small loading={busy} onPress={() => act(b._id, "accept", "accept", reload)} />
                    <Button
                      title="Reject"
                      small
                      variant="danger"
                      disabled={busy}
                      onPress={() => setRejecting({ id: b._id, reload })}
                    />
                  </>
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
      // A Modal renders in its own overlay, so where it sits in the tree makes
      // no difference to layout — `header` is simply the one slot AdminList
      // offers for a node that isn't a row.
      header={
        <ReasonDialog
          visible={rejecting !== null}
          title="Reject this booking?"
          message="The customer is told you rejected it, and sees this reason."
          placeholder="e.g. We don't service this model"
          confirmLabel="Reject booking"
          busy={busyId !== null && busyId === rejecting?.id}
          onCancel={() => setRejecting(null)}
          onConfirm={confirmReject}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  quote: { marginTop: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
