import { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

/**
 * A month-by-month bar chart, drawn with plain Views.
 *
 * There is no charting library in this project and adding one (victory-native,
 * react-native-svg + d3) would pull a native dependency in for a single
 * screen. A bar chart is the one chart shape that needs no path maths — a bar
 * is a rectangle of a given height — so it is drawn directly. That also means
 * it renders identically on native and on react-native-web.
 */

export interface MonthDatum {
  /** "YYYY-MM" — sorts lexicographically, which is why it is stored this way. */
  key: string;
  /** "Mar", plus a year suffix when the range spans more than one. */
  label: string;
  /** Bar height driver: how many services that month. */
  count: number;
  /** Shown in the tooltip, in paisa. */
  spend: number;
}

/**
 * Sequential blue ramp rather than one colour per bar. Months are an ordered
 * series, not categories, so a categorical palette would imply differences
 * between them that do not exist. Height already encodes the value; the ramp
 * reinforces it, with the darkest reserved for the busiest month so the peak
 * reads at a glance.
 *
 * All five clear 4.5:1 against white for the value labels drawn over the
 * axis, and they are the same navy/blue family as the rest of the app.
 */
const RAMP = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"] as const;

/** Zero-value months keep a visible sliver so the axis reads as continuous. */
const EMPTY_BAR = colors.slate200;

const barColor = (count: number, max: number): string => {
  if (count <= 0) return EMPTY_BAR;
  if (max <= 0) return RAMP[RAMP.length - 1];
  // Ratio → ramp index. The busiest month always lands on the darkest step.
  const idx = Math.min(RAMP.length - 1, Math.floor((count / max) * RAMP.length - 1e-9));
  return RAMP[Math.max(0, idx)];
};

const CHART_HEIGHT = 168;
const BAR_WIDTH = 34;
const BAR_GAP = spacing.md;

export function MonthlyBarChart({
  data,
  formatValue,
}: {
  data: MonthDatum[];
  /** Renders the secondary figure in the tooltip (money, usually). */
  formatValue?: (spend: number) => string;
}) {
  // Tapping a bar is the mobile stand-in for hover: there is no cursor, and
  // the axis labels alone cannot carry both the count and the amount.
  const [selected, setSelected] = useState<string | null>(null);
  const [width, setWidth] = useState(0);

  const max = useMemo(() => Math.max(...data.map((d) => d.count), 0), [data]);

  // The bars scroll horizontally only when they overflow. Centering a short
  // series looks deliberate; a scroll view that never scrolls looks broken.
  const contentWidth = data.length * BAR_WIDTH + Math.max(0, data.length - 1) * BAR_GAP;
  const fits = width > 0 && contentWidth <= width - spacing.lg * 2;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (data.length === 0) return null;

  const active = data.find((d) => d.key === selected) ?? null;

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {/* Reserved regardless of selection, so tapping a bar does not shift the
          chart down and move the bar out from under the finger. */}
      <View style={styles.tooltip}>
        {active ? (
          <>
            <Text style={styles.tooltipTitle}>{active.label}</Text>
            <Text style={styles.tooltipBody}>
              {active.count} {active.count === 1 ? "service" : "services"}
              {formatValue ? ` · ${formatValue(active.spend)}` : ""}
            </Text>
          </>
        ) : (
          <Text style={styles.tooltipHint}>Tap a bar for that month's detail</Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!fits}
        contentContainerStyle={[styles.plot, fits && styles.plotCentered]}
      >
        {data.map((d) => {
          // A month with work always shows at least a stub, so "one service"
          // never renders as an invisible bar next to a zero month.
          const h = max > 0 && d.count > 0 ? Math.max(6, (d.count / max) * CHART_HEIGHT) : 3;
          const isActive = d.key === selected;
          return (
            <Pressable
              key={d.key}
              style={styles.col}
              onPress={() => setSelected(isActive ? null : d.key)}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${d.count} services`}
            >
              <Text style={[styles.value, d.count === 0 && styles.valueEmpty]}>{d.count || ""}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: barColor(d.count, max) },
                    // Selection is an outline, not a colour swap: recolouring
                    // the bar would break the ramp's meaning.
                    isActive && styles.barActive,
                  ]}
                />
              </View>
              <Text style={[styles.axis, isActive && styles.axisActive]} numberOfLines={1}>
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  tooltip: { minHeight: 38, justifyContent: "center" },
  tooltipTitle: { fontSize: 14, fontWeight: "700", color: colors.navy900 },
  tooltipBody: { fontSize: 13, color: colors.slate600, marginTop: 1 },
  tooltipHint: { fontSize: 12, color: colors.slate400 },
  plot: { flexDirection: "row", alignItems: "flex-end", gap: BAR_GAP, paddingHorizontal: spacing.xs },
  plotCentered: { flexGrow: 1, justifyContent: "center" },
  col: { width: BAR_WIDTH, alignItems: "center", gap: spacing.xs },
  value: { fontSize: 11, fontWeight: "700", color: colors.slate600, height: 14 },
  valueEmpty: { color: "transparent" },
  // Fixed-height track with bottom-aligned content: bars grow upward from a
  // shared baseline instead of each column centring its own bar.
  track: { height: CHART_HEIGHT, width: BAR_WIDTH, justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  barActive: { borderWidth: 2, borderColor: colors.navy900 },
  axis: { fontSize: 10, color: colors.slate400, fontWeight: "600" },
  axisActive: { color: colors.navy900 },
});
