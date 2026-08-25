import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApi } from "../lib/useApi";
import { Screen, Card, Heading, Muted, Loading, ErrorNote, Empty } from "./ui";
import { colors, spacing } from "../theme";

/**
 * The shape almost every admin screen takes: a heading, a fetched list, and a
 * card per row.
 *
 * The web admin pages were tables, and each one rebuilt its own loading /
 * error / empty handling around a <table>. A phone has no room for tables, so
 * every one of them becomes a card list — which means the same wrapper works
 * for all of them, and each screen only has to say how one row looks.
 */
export function AdminList<T>({
  title,
  subtitle,
  path,
  select,
  renderItem,
  keyExtractor,
  emptyMessage,
  noMatchMessage = "Nothing matches that search.",
  errorMessage = "Could not load this list.",
  header,
  /** Bumping this refetches — used after an action changes the data. */
  refreshKey,
  filterItem,
}: {
  title: string;
  subtitle?: string;
  path: string | null;
  select: (data: any) => T[];
  renderItem: (item: T, reload: () => void) => ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage: string;
  /** Shown when rows exist but the current search hides all of them — an
   *  empty search result is a different situation from an empty list, and
   *  saying "no accounts exist" to someone with a typo in the box is wrong. */
  noMatchMessage?: string;
  errorMessage?: string;
  header?: ReactNode;
  refreshKey?: number;
  /**
   * Client-side row filter, used for search boxes. It is applied here rather
   * than by the caller because this component owns the fetch, so a caller
   * filtering afterwards would have nothing to filter.
   *
   * Search stays on the client because these lists are small enough to hold
   * in memory, and filtering locally keeps typing instant — no request per
   * keystroke, and no debounce to tune.
   */
  filterItem?: (item: T) => boolean;
}) {
  // refreshKey rides along in the path as a cache-busting query so a changed
  // key re-runs the fetch. Cheap, and it keeps this component from needing an
  // imperative handle.
  const fetchPath = path
    ? refreshKey
      ? `${path}${path.includes("?") ? "&" : "?"}_r=${refreshKey}`
      : path
    : null;

  const { data, loading, refreshing, error, refresh, reload } = useApi<T[]>(
    fetchPath,
    select,
    errorMessage
  );

  if (loading) return <Loading label={`Loading ${title.toLowerCase()}…`} />;

  const rows = data ?? [];
  const visible = filterItem ? rows.filter(filterItem) : rows;
  // Distinguishes "there is nothing here" from "your search excluded
  // everything", which need different wording to be useful.
  const hiddenBySearch = rows.length > 0 && visible.length === 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View>
        <Heading>{title}</Heading>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>

      {header}

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {/* An empty message is how a screen says "this tab has no list at all"
          (see the CCTV screen's Live/Cameras tabs) — show nothing rather than
          an empty box. */}
      {!error && hiddenBySearch ? <Empty message={noMatchMessage} /> : null}
      {!error && emptyMessage && rows.length === 0 ? <Empty message={emptyMessage} /> : null}

      {visible.map((item) => (
        <View key={keyExtractor(item)}>{renderItem(item, reload)}</View>
      ))}
    </Screen>
  );
}

/** A card row with a title, a subtitle and a trailing slot for a badge. */
export function ListRow({
  title,
  subtitle,
  trailing,
  children,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.main}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {trailing}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  main: { flex: 1, gap: 2 },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 15 },
});
