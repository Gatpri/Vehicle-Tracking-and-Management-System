import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import api, { getErrorMessage } from "../../src/lib/api";
import { useAuth } from "../../src/lib/AuthContext";
import { getSocket } from "../../src/lib/socket";
import { hasPermission } from "../../src/lib/permissions";
import { AdminList, ListRow } from "../../src/components/AdminList";
import { Badge, Button, Row } from "../../src/components/ui";
import { spacing } from "../../src/theme";
import { formatDateTime, vehicleLabel, type SosAlert } from "../../src/lib/types";

/**
 * Ported from the web app's AdminSosPage.tsx.
 *
 * New alerts arrive over the socket rather than by polling, which matters more
 * here than anywhere else in the app — an SOS that shows up a minute late is a
 * minute someone spent waiting.
 *
 * "Open in maps" hands the coordinates to the phone's own maps app, which is
 * the fastest route to actually driving there. The web page could only draw a
 * pin on a Leaflet map.
 */
export default function AdminSosScreen() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canResolve = hasPermission(user?.role, "sos:resolve", user?.permissions ?? []);

  useEffect(() => {
    const socket = getSocket();
    const bump = () => setRefreshKey((k) => k + 1);
    socket.on("sos:new", bump);
    socket.on("sos:resolved", bump);
    socket.on("sos:locationUpdate", bump);
    return () => {
      socket.off("sos:new", bump);
      socket.off("sos:resolved", bump);
      socket.off("sos:locationUpdate", bump);
    };
  }, []);

  const resolve = async (id: string, reload: () => void) => {
    setBusyId(id);
    try {
      await api.patch(`/sos/${id}/resolve`);
      reload();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert("Could not resolve", getErrorMessage(err, "Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const openInMaps = (lat: number, lng: number) => {
    // The geo: scheme is understood by every maps app on Android; iOS falls
    // back to Apple Maps via the http URL, which also works everywhere.
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => Alert.alert("Could not open maps"));
  };

  return (
    <AdminList<SosAlert>
      title="SOS alerts"
      subtitle="Live emergencies raised by customers."
      path="/sos"
      select={(d) => d.alerts ?? []}
      keyExtractor={(a) => a._id}
      emptyMessage="No SOS alerts."
      refreshKey={refreshKey}
      renderItem={(a, reload) => {
        const active = (a.status || "").toLowerCase() === "active";
        return (
          <ListRow
            title={a.message || "SOS alert"}
            subtitle={
              typeof a.user === "object" && a.user
                ? `${a.user.firstname ?? ""} ${a.user.lastname ?? ""}`.trim() || a.user.email
                : undefined
            }
            trailing={<Badge status={a.status} />}
          >
            <Row label="Raised" value={formatDateTime(a.createdAt)} />
            {a.kind === "theft" ? <Row label="Source" value="CCTV theft detection" /> : null}
            {typeof a.vehicle === "object" && a.vehicle ? (
              <Row label="Vehicle" value={vehicleLabel(a.vehicle)} />
            ) : null}
            {a.location?.lat != null && a.location?.lng != null ? (
              <Row label="Position" value={`${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`} />
            ) : null}

            <View style={styles.actions}>
              {a.location?.lat != null && a.location?.lng != null ? (
                <Button
                  title="Open in maps"
                  variant="outline"
                  small
                  onPress={() => openInMaps(a.location!.lat!, a.location!.lng!)}
                />
              ) : null}
              {canResolve && active ? (
                <Button
                  title="Mark resolved"
                  small
                  loading={busyId === a._id}
                  onPress={() => resolve(a._id, reload)}
                />
              ) : null}
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
