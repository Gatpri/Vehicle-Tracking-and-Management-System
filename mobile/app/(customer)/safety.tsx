import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "../../src/lib/useApi";
import { Map, type MapPoint } from "../../src/components/Map";
import { Screen, Card, Heading, Muted, Button, Badge, Loading, ErrorNote, Empty, Row } from "../../src/components/ui";
import { colors, spacing } from "../../src/theme";
import { formatDate, vehicleLabel, type TheftReport } from "../../src/lib/types";

/**
 * Safety: where thefts have been reported, and what you have reported.
 *
 * Filing a report lives on the SOS screen instead — that is where someone goes
 * when something has just gone wrong. This screen is for looking, not acting.
 */
export default function SafetyScreen() {
  const router = useRouter();

  const heatmap = useApi<{ location?: { lat: number; lng: number }; lat?: number; lng?: number; count?: number }[]>(
    "/theft-reports/heatmap",
    (d) => d.points ?? d.heatmap ?? [],
    "Could not load the theft map."
  );
  const mine = useApi<TheftReport[]>(
    "/theft-reports/mine",
    (d) => d.reports ?? [],
    "Could not load your reports."
  );

  // The backend nests coordinates under `location` on heatmap clusters, but
  // older shapes used flat lat/lng — both are handled rather than assuming one.
  const points: MapPoint[] = (heatmap.data ?? [])
    .map((p) => {
      const lat = p.location?.lat ?? p.lat;
      const lng = p.location?.lng ?? p.lng;
      if (lat == null || lng == null) return null;
      return {
        lat,
        lng,
        title: "Reported theft",
        description: p.count ? `${p.count} incident(s) here` : undefined,
        color: colors.red500,
      };
    })
    .filter(Boolean) as MapPoint[];

  if (heatmap.loading) return <Loading label="Loading the safety map…" />;

  return (
    <Screen
      refreshing={heatmap.refreshing}
      onRefresh={() => {
        heatmap.refresh();
        mine.refresh();
      }}
    >
      <Heading>Safety</Heading>
      <Muted>Where vehicle thefts have been reported near you.</Muted>

      {heatmap.error ? <ErrorNote message={heatmap.error} onRetry={heatmap.reload} /> : null}

      {points.length > 0 ? (
        <View style={styles.mapWrap}>
          <Map points={points} />
        </View>
      ) : (
        <Empty message="No thefts have been reported in this area." />
      )}

      <Card>
        <Heading level={2}>Vehicle stolen?</Heading>
        <Muted>Report it from the SOS screen — it takes your location the same way.</Muted>
        <Button
          title="Report a stolen vehicle"
          variant="danger"
          onPress={() => router.push("/(customer)/sos")}
        />
      </Card>

      <Heading level={2}>Your reports</Heading>
      {(mine.data ?? []).length === 0 ? (
        <Empty message="You have not filed any theft reports." />
      ) : (
        (mine.data ?? []).map((r) => (
          <Card key={r._id}>
            <View style={styles.head}>
              <Text style={styles.title}>
                {vehicleLabel(typeof r.vehicle === "object" ? r.vehicle : undefined)}
              </Text>
              <Badge status={r.status} />
            </View>
            <Row label="Filed" value={formatDate(r.createdAt)} />
            {r.description ? <Row label="Details" value={r.description} /> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: { overflow: "hidden" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15, flex: 1 },
});
