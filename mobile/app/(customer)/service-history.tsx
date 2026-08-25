import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "../../src/lib/useApi";
import { statusLabel } from "../../src/lib/bookingWorkflow";
import { MonthlyBarChart, type MonthDatum } from "../../src/components/MonthlyBarChart";
import { Screen, Card, Heading, Muted, Badge, Loading, ErrorNote, Empty, Row } from "../../src/components/ui";
import { colors, radius, spacing } from "../../src/theme";
import { formatMoney, formatDate, vehicleLabel, type Booking } from "../../src/lib/types";

/**
 * Every service this account has had done, across all of its vehicles, with a
 * month-by-month chart of the activity.
 *
 * The per-vehicle vehicle/[id]/history screen answers "what has happened to
 * this car". This answers "what have I spent, and when", which is a different
 * question and could not be got at before without opening each vehicle in turn
 * and adding it up by hand.
 *
 * /bookings/mine is already scoped to the signed-in user server-side, so the
 * filtering here is only about which statuses count as history.
 */

/** Only finished work is history — an in-flight booking has no final price. */
const DONE = ["completed", "paid", "delivered", "closed"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The date a job counts against: when it finished, else when it was raised. */
const bookingDate = (b: Booking): Date | null => {
  const iso = b.statusChangedAt || b.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Bookings to one datum per month, including the months with no activity.
 *
 * Gaps have to be filled: dropping empty months would put March next to
 * September at the same spacing as two consecutive months, which misreads as
 * steady work. A quiet stretch is information.
 */
function toMonthly(bookings: Booking[]): MonthDatum[] {
  const buckets = new Map<string, { count: number; spend: number }>();
  let min: Date | null = null;
  let max: Date | null = null;

  for (const b of bookings) {
    const d = bookingDate(b);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const prev = buckets.get(key) ?? { count: 0, spend: 0 };
    buckets.set(key, { count: prev.count + 1, spend: prev.spend + (b.finalPrice ?? 0) });
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }

  if (!min || !max) return [];

  // Cap the window so a years-old first booking cannot stretch the axis into
  // dozens of unreadable bars; the recent year is what anyone is looking at.
  const MAX_MONTHS = 12;
  const last = new Date(max.getFullYear(), max.getMonth(), 1);
  const first = new Date(min.getFullYear(), min.getMonth(), 1);
  const earliest = new Date(last.getFullYear(), last.getMonth() - (MAX_MONTHS - 1), 1);
  const from = first > earliest ? first : earliest;

  // Year suffix only when the range crosses one, so a single-year chart is not
  // cluttered with the same year repeated on every bar.
  const spansYears = from.getFullYear() !== last.getFullYear();

  const out: MonthDatum[] = [];
  for (const d = new Date(from); d <= last; d.setMonth(d.getMonth() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hit = buckets.get(key) ?? { count: 0, spend: 0 };
    const year = String(d.getFullYear()).slice(2);
    out.push({
      key,
      label: spansYears ? `${MONTH_NAMES[d.getMonth()]} ${year}` : MONTH_NAMES[d.getMonth()],
      count: hit.count,
      spend: hit.spend,
    });
  }
  return out;
}

export default function AccountServiceHistoryScreen() {
  const { data, loading, refreshing, error, refresh, reload } = useApi<Booking[]>(
    "/bookings/mine",
    (d) => d.bookings ?? [],
    "Could not load your service history."
  );

  const history = useMemo(
    () => (data ?? []).filter((b) => DONE.includes((b.status || "").toLowerCase())),
    [data]
  );

  const monthly = useMemo(() => toMonthly(history), [history]);

  const totals = useMemo(() => {
    const spend = history.reduce((sum, b) => sum + (b.finalPrice ?? 0), 0);
    // Distinct vehicles serviced, which is not the same as vehicles owned — a
    // car registered last week and never serviced should not be counted.
    const vehicles = new Set(
      history.map((b) => (typeof b.vehicle === "object" ? b.vehicle?._id : b.vehicle)).filter(Boolean)
    ).size;
    const busiest = monthly.reduce<MonthDatum | null>(
      (best, m) => (m.count > 0 && (!best || m.count > best.count) ? m : best),
      null
    );
    return { spend, vehicles, busiest };
  }, [history, monthly]);

  if (loading) return <Loading label="Loading service history..." />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View>
        <Heading>Service history</Heading>
        <Muted>Every completed service on this account.</Muted>
      </View>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {!error && history.length === 0 ? (
        <Empty message="No completed services yet. Once a booking is finished it shows up here." />
      ) : null}

      {history.length > 0 ? (
        <>
          <View style={styles.stats}>
            <Card style={styles.stat}>
              <Text style={styles.statValue}>{history.length}</Text>
              <Text style={styles.statLabel}>Services</Text>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statValue}>{formatMoney(totals.spend)}</Text>
              <Text style={styles.statLabel}>Total spent</Text>
            </Card>
            <Card style={styles.stat}>
              <Text style={styles.statValue}>{totals.vehicles}</Text>
              <Text style={styles.statLabel}>{totals.vehicles === 1 ? "Vehicle" : "Vehicles"}</Text>
            </Card>
          </View>

          <Card style={styles.chartCard}>
            <View style={styles.chartHead}>
              <Heading level={2}>Services by month</Heading>
              {totals.busiest ? <Muted>Busiest month: {totals.busiest.label}</Muted> : null}
            </View>
            <MonthlyBarChart data={monthly} formatValue={formatMoney} />
          </Card>

          <Heading level={2}>All services</Heading>
          {history.map((b) => (
            <Card key={b._id}>
              <View style={styles.head}>
                <View style={styles.main}>
                  <Text style={styles.title}>{b.serviceType || "Service"}</Text>
                  <Muted>
                    {vehicleLabel(typeof b.vehicle === "object" ? b.vehicle : undefined)}
                    {typeof b.workshop === "object" && b.workshop?.name ? ` · ${b.workshop.name}` : ""}
                  </Muted>
                </View>
                <Badge status={statusLabel(b.status)} />
              </View>
              <Row label="Date" value={formatDate(b.statusChangedAt || b.createdAt)} />
              {/* finalPrice is what was actually charged; quotedPrice is only
                  an estimate, so it is not shown as if it were the bill. */}
              {b.finalPrice ? <Row label="Paid" value={formatMoney(b.finalPrice)} /> : null}
              {b.description ? <Row label="Notes" value={b.description} /> : null}
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, padding: spacing.md, alignItems: "center", gap: 2, borderRadius: radius.md },
  statValue: { fontSize: 16, fontWeight: "800", color: colors.navy900, textAlign: "center" },
  statLabel: { fontSize: 11, color: colors.slate600, fontWeight: "600" },
  chartCard: { gap: spacing.sm },
  chartHead: { gap: 2 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
});
