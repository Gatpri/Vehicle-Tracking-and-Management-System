import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useApi } from "../../../../src/lib/useApi";
import { statusLabel } from "../../../../src/lib/bookingWorkflow";
import { Screen, Card, Heading, Muted, Badge, Loading, ErrorNote, Empty, Row } from "../../../../src/components/ui";
import { colors, spacing } from "../../../../src/theme";
import { formatMoney, formatDate, type Booking } from "../../../../src/lib/types";

/**
 * Ported from the web app's ServiceHistoryPage.tsx — every past job on one
 * vehicle, from /vehicles/:id/service-history.
 */
export default function ServiceHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refreshing, error, refresh, reload } = useApi<Booking[]>(
    id ? `/vehicles/${id}/service-history` : null,
    (d) => d.bookings ?? d.history ?? [],
    "Could not load the service history."
  );

  if (loading) return <Loading label="Loading service history…" />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Heading>Service history</Heading>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!error && (data ?? []).length === 0 ? (
        <Empty message="No completed services for this vehicle yet." />
      ) : null}

      {(data ?? []).map((b) => (
        <Card key={b._id}>
          <View style={styles.head}>
            <View style={styles.main}>
              <Text style={styles.title}>{b.serviceType}</Text>
              {typeof b.workshop === "object" && b.workshop?.name ? (
                <Muted>{b.workshop.name}</Muted>
              ) : null}
            </View>
            <Badge status={statusLabel(b.status)} />
          </View>
          <Row label="Date" value={formatDate(b.createdAt)} />
          {/* finalPrice is what was actually charged; quotedPrice is only an
              estimate, so it is not shown as if it were the bill. */}
          {b.finalPrice ? <Row label="Paid" value={formatMoney(b.finalPrice)} /> : null}
          {b.description ? <Row label="Notes" value={b.description} /> : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
});
