import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import api from "../../src/lib/api";
import { getSocket } from "../../src/lib/socket";
import { Map, type MapPoint } from "../../src/components/Map";
import { Screen, Card, Heading, Muted, Loading, ErrorNote, Empty, Row } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";
import { formatDateTime } from "../../src/lib/types";

/**
 * Ported from the web app's AdminStaffLocationsPage.tsx — where every on-duty
 * driver is right now.
 *
 * Positions arrive over the socket ("staff:location"), with "staff:offline"
 * removing a driver who has stopped sharing. The initial set is fetched once;
 * after that this screen is entirely event-driven, which is why there is no
 * polling and no refresh interval.
 */
type StaffPosition = {
  staffId: string;
  name?: string;
  lat: number;
  lng: number;
  updatedAt?: string;
};

export default function AdminStaffLocationsScreen() {
  const [positions, setPositions] = useState<Record<string, StaffPosition>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/delivery-staff")
      .then((res) => {
        const staff = res.data.staff ?? res.data.deliveryStaff ?? [];
        const seeded: Record<string, StaffPosition> = {};
        // Only drivers with a known last position are worth placing; the rest
        // appear as soon as they start sharing.
        staff.forEach((s: any) => {
          const loc = s.lastLocation ?? s.location;
          if (loc?.lat != null && loc?.lng != null) {
            seeded[s._id] = {
              staffId: s._id,
              name: `${s.firstname ?? ""} ${s.lastname ?? ""}`.trim() || s.email,
              lat: loc.lat,
              lng: loc.lng,
              updatedAt: loc.recordedAt ?? loc.updatedAt,
            };
          }
        });
        setPositions(seeded);
      })
      .catch(() => setError("Could not load staff locations."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onLocation = (p: StaffPosition & { firstname?: string; lastname?: string }) => {
      if (p?.lat == null || p?.lng == null || !p.staffId) return;
      setPositions((prev) => ({
        ...prev,
        [p.staffId]: {
          staffId: p.staffId,
          name: p.name || `${p.firstname ?? ""} ${p.lastname ?? ""}`.trim() || prev[p.staffId]?.name,
          lat: p.lat,
          lng: p.lng,
          updatedAt: p.updatedAt ?? new Date().toISOString(),
        },
      }));
    };

    const onOffline = (p: { staffId?: string }) => {
      if (!p?.staffId) return;
      // Removed rather than greyed out: a stale pin on a map reads as a live
      // position, which is worse than no pin at all.
      setPositions((prev) => {
        const next = { ...prev };
        delete next[p.staffId!];
        return next;
      });
    };

    socket.on("staff:location", onLocation);
    socket.on("staff:offline", onOffline);
    return () => {
      socket.off("staff:location", onLocation);
      socket.off("staff:offline", onOffline);
    };
  }, []);

  const list = Object.values(positions);
  const points: MapPoint[] = list.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    title: p.name || "Driver",
    description: p.updatedAt ? `Updated ${formatDateTime(p.updatedAt)}` : undefined,
    color: colors.blue700,
  }));

  if (loading) return <Loading label="Loading staff locations…" />;

  return (
    <Screen>
      <Heading>Staff locations</Heading>
      <Muted>Drivers currently sharing their position.</Muted>

      {error ? <ErrorNote message={error} /> : null}

      {points.length > 0 ? (
        <View style={styles.mapWrap}>
          <Map points={points} />
        </View>
      ) : (
        <Empty message="No drivers are sharing their location right now." />
      )}

      {list.map((p) => (
        <Card key={p.staffId}>
          <Text style={styles.name}>{p.name || "Driver"}</Text>
          <Row label="Position" value={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`} />
          {p.updatedAt ? <Row label="Updated" value={formatDateTime(p.updatedAt)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: { overflow: "hidden" },
  name: { fontWeight: "700", color: colors.navy900, fontSize: 15, marginBottom: spacing.xs },
});
