import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { legStatusLabel } from "../../src/lib/bookingWorkflow";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Card, Heading, Muted, Row } from "../../src/components/ui";
import { colors, radius, spacing } from "../../src/theme";
import { vehicleLabel, type Delivery, type UserRecord } from "../../src/lib/types";

/**
 * Ported from the web app's AdminDeliveriesPage.tsx — assigning drivers to
 * bookings that asked for pickup, and watching the legs already running.
 *
 * The web page had two tables side by side (assignable, then active). A phone
 * gets a single scroll with the work that needs a decision first.
 *
 * Region scoping is the server's job: a delivery-admin calling these endpoints
 * only ever gets their own region back, so nothing is filtered here.
 */
type AssignableRow = { booking: { _id: string; serviceType?: string; vehicle?: unknown }; leg: "pickup" | "return" };

export default function AdminDeliveriesScreen() {
  const [assignable, setAssignable] = useState<AssignableRow[]>([]);
  const [staff, setStaff] = useState<UserRecord[]>([]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadAssignable = async () => {
    try {
      const [a, s] = await Promise.all([
        api.get("/deliveries/assignable"),
        api.get("/deliveries/staff"),
      ]);
      setAssignable(a.data.rows ?? a.data.assignable ?? []);
      setStaff(s.data.staff ?? []);
    } catch {
      // The active-deliveries list below still renders; losing the assignment
      // panel is not worth blocking the whole screen for.
      setAssignable([]);
    }
  };

  useEffect(() => {
    loadAssignable();
  }, [refreshKey]);

  const assign = async (row: AssignableRow) => {
    const staffId = chosen[`${row.booking._id}:${row.leg}`];
    if (!staffId) {
      Alert.alert("Choose a driver", "Pick who should handle this leg.");
      return;
    }
    setBusy(row.booking._id);
    try {
      await api.post("/deliveries", { bookingId: row.booking._id, leg: row.leg, staffId });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not assign", getErrorMessage(err, "Please try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminList<Delivery & { leg: "pickup" | "return" }>
      title="Deliveries"
      subtitle="Assign drivers and follow the legs in progress."
      path="/deliveries"
      select={(d) => d.deliveries ?? []}
      keyExtractor={(d) => d._id}
      emptyMessage="No deliveries yet."
      refreshKey={refreshKey}
      header={
        assignable.length > 0 ? (
          <Card>
            <Heading level={2}>Waiting for a driver</Heading>
            <Muted>{`${assignable.length} leg${assignable.length === 1 ? "" : "s"} to assign.`}</Muted>

            {assignable.map((row) => {
              const key = `${row.booking._id}:${row.leg}`;
              return (
                <View key={key} style={styles.assignRow}>
                  <Text style={styles.assignTitle}>
                    {row.leg === "pickup" ? "Collect" : "Return"} · {row.booking.serviceType || "Service"}
                  </Text>

                  <View style={styles.chips}>
                    {staff.length === 0 ? (
                      <Muted>No drivers available in this region.</Muted>
                    ) : (
                      staff.map((s) => (
                        <Pressable key={s._id} onPress={() => setChosen((c) => ({ ...c, [key]: s._id }))}>
                          <View style={[styles.chip, chosen[key] === s._id && styles.chipOn]}>
                            <Text style={[styles.chipText, chosen[key] === s._id && styles.chipTextOn]}>
                              {`${s.firstname ?? ""} ${s.lastname ?? ""}`.trim() || s.email}
                            </Text>
                          </View>
                        </Pressable>
                      ))
                    )}
                  </View>

                  <Button
                    title="Assign"
                    small
                    loading={busy === row.booking._id}
                    disabled={!chosen[key]}
                    onPress={() => assign(row)}
                  />
                </View>
              );
            })}
          </Card>
        ) : null
      }
      renderItem={(d) => (
        <ListRow
          title={d.leg === "pickup" ? "Collect from customer" : "Return to customer"}
          subtitle={vehicleLabel(
            typeof d.booking === "object" && typeof d.booking?.vehicle === "object" ? d.booking.vehicle : undefined
          )}
          trailing={<Badge status={legStatusLabel(d.leg, d.status)} />}
        >
          {typeof d.staff === "object" && d.staff ? (
            <Row label="Driver" value={`${d.staff.firstname ?? ""} ${d.staff.lastname ?? ""}`.trim()} />
          ) : (
            <Row label="Driver" value="Unassigned" />
          )}
          {d.pickupAddress ? <Row label="Pick up" value={d.pickupAddress} /> : null}
          {d.dropoffAddress ? <Row label="Drop off" value={d.dropoffAddress} /> : null}
        </ListRow>
      )}
    />
  );
}

const styles = StyleSheet.create({
  assignRow: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  assignTitle: { fontWeight: "700", color: colors.navy900, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.blue700, borderColor: colors.blue700 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 12 },
  chipTextOn: { color: "#fff" },
});
