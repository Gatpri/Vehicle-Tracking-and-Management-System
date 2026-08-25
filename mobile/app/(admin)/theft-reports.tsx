import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { getSocket } from "../../src/lib/socket";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatDateTime, vehicleLabel, type TheftReport } from "../../src/lib/types";

/**
 * Ported from the web app's AdminTheftPage.tsx — reports filed by owners, and
 * the decision to close them.
 *
 * Resolving a report is what un-flags the vehicle, so CCTV sightings stop
 * raising alerts for it. That is a consequential action rather than a tidy-up,
 * which is why it confirms first.
 */
export default function AdminTheftScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const bump = () => setRefreshKey((k) => k + 1);
    socket.on("theft:new", bump);
    socket.on("theft:sighting", bump);
    return () => {
      socket.off("theft:new", bump);
      socket.off("theft:sighting", bump);
    };
  }, []);

  const setStatus = (id: string, status: string, reload: () => void) => {
    const closing = status === "resolved";
    Alert.alert(
      closing ? "Close this report?" : "Reopen this report?",
      closing
        ? "The vehicle stops being flagged, so CCTV sightings will no longer raise an alert."
        : "The vehicle is flagged again and sightings will raise alerts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: closing ? "Close report" : "Reopen",
          style: closing ? "destructive" : "default",
          onPress: async () => {
            setBusyId(id);
            try {
              await api.patch(`/theft-reports/${id}`, { status });
              reload();
              setRefreshKey((k) => k + 1);
            } catch (err) {
              Alert.alert("Could not update", getErrorMessage(err, "Please try again."));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <AdminList<TheftReport>
      title="Theft reports"
      subtitle="Vehicles reported stolen by their owners."
      path="/theft-reports"
      select={(d) => d.reports ?? []}
      keyExtractor={(r) => r._id}
      emptyMessage="No theft reports filed."
      refreshKey={refreshKey}
      renderItem={(r, reload) => {
        const open = (r.status || "").toLowerCase() !== "resolved";
        return (
          <ListRow
            title={vehicleLabel(typeof r.vehicle === "object" ? r.vehicle : undefined)}
            subtitle={r.description || undefined}
            trailing={<Badge status={r.status} />}
          >
            <Row label="Filed" value={formatDateTime(r.createdAt)} />
            {typeof r.vehicle === "object" && r.vehicle?.numberPlate ? (
              <Row label="Plate" value={r.vehicle.numberPlate} />
            ) : null}

            <View style={styles.actions}>
              {open ? (
                <Button
                  title="Mark resolved"
                  small
                  loading={busyId === r._id}
                  onPress={() => setStatus(r._id, "resolved", reload)}
                />
              ) : (
                <Button
                  title="Reopen"
                  variant="outline"
                  small
                  loading={busyId === r._id}
                  onPress={() => setStatus(r._id, "active", reload)}
                />
              )}
            </View>
          </ListRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
