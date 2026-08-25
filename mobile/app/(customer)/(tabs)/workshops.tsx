import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useApi } from "../../../src/lib/useApi";
import { Screen, Card, Heading, Muted, Button, Loading, ErrorNote, Empty, Field } from "../../../src/components/ui";
import { colors, radius, spacing } from "../../../src/theme";
import { VEHICLE_BRANDS, BIKE_TYPES, SORT_LABELS, type SortMode } from "../../../src/lib/workshopOptions";
import type { Workshop } from "../../../src/lib/types";

/**
 * Ported from the web app's WorkshopsPage.tsx, filters included.
 *
 * The web page asked the browser for a position via navigator.geolocation and
 * sent it as lat/lng so the list could be distance-sorted. The same idea here,
 * but through expo-location, which has a real permission prompt and returns a
 * far more accurate fix on a phone than a desktop browser ever did — this is
 * one of the places the native version is genuinely better than the web one.
 *
 * Location is optional: if the user declines, the list still loads, just
 * unsorted. Refusing to show workshops because someone said no to a permission
 * prompt would be the wrong trade.
 *
 * Filtering is split the same way the web page splits it. Service type, brand,
 * bike type and sort order are query params, because the server does that work
 * (and sorting by rating or sentiment needs the whole set, not one page of it).
 * The free-text box stays on the client: it matches name and address, which are
 * already in hand, so typing filters instantly with no request per keystroke.
 */
export default function WorkshopsScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [query, setQuery] = useState("");

  // Server-side filters. These are held separately from the "applied" set
  // below so that tapping several chips does not fire a request each time.
  const [serviceType, setServiceType] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortMode>("best");
  const [applied, setApplied] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // Location services off, or no fix available. Fall through to the
        // unsorted list rather than surfacing an error for something optional.
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  const toggle = (value: string, list: string[], setList: (v: string[]) => void) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  // Waits for the location attempt to settle before fetching, so the request
  // carries coordinates when they are available. `null` path = no fetch yet.
  //
  // `applied` is in the dependency list but not the query: bumping it is what
  // makes the memo produce a new string, which is what re-runs the fetch when
  // someone presses Apply without having changed the coordinates.
  const path = useMemo(() => {
    if (locating) return null;
    const params = new URLSearchParams();
    if (serviceType.trim()) params.set("serviceType", serviceType.trim());
    if (brands.length) params.set("brands", brands.join(","));
    if (types.length) params.set("bikeTypes", types.join(","));
    params.set("sortBy", sortBy);
    if (coords) {
      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));
    }
    params.set("_applied", String(applied));
    return `/workshops?${params.toString()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locating, coords, applied]);

  const { data, loading, refreshing, error, refresh, reload } = useApi<Workshop[]>(
    path,
    (d) => d.workshops ?? [],
    "Could not load workshops."
  );

  const visible = (data ?? []).filter((w) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return [w.name, w.address, w.area, w.region]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q));
  });

  const activeFilters = brands.length + types.length + (serviceType.trim() ? 1 : 0);

  const clearFilters = () => {
    setServiceType("");
    setBrands([]);
    setTypes([]);
    setSortBy("best");
    setApplied((n) => n + 1);
  };

  if (locating || loading) return <Loading label="Finding workshops near you…" />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Heading>Workshops</Heading>
      {coords ? (
        <Muted>Sorted by distance from you.</Muted>
      ) : (
        <Muted>Turn on location to see the closest workshops first.</Muted>
      )}

      <Field label="Search" value={query} onChangeText={setQuery} placeholder="Name or area" />

      <Card>
        <View style={styles.filterHead}>
          <Heading level={2}>
            {activeFilters ? `Filters (${activeFilters})` : "Filters"}
          </Heading>
          <Button
            title={showFilters ? "Hide" : "Show"}
            variant="ghost"
            small
            onPress={() => setShowFilters((v) => !v)}
          />
        </View>

        {showFilters ? (
          <View style={styles.filterBody}>
            <Field
              label="Service type"
              value={serviceType}
              onChangeText={setServiceType}
              placeholder="e.g. oil_change"
              autoCapitalize="none"
            />

            <Text style={styles.groupLabel}>Sort by</Text>
            <View style={styles.chipRow}>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <Pressable key={mode} onPress={() => setSortBy(mode)}>
                  <View style={[styles.chip, sortBy === mode && styles.chipOn]}>
                    <Text style={[styles.chipText, sortBy === mode && styles.chipTextOn]}>
                      {SORT_LABELS[mode]}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {/* "Nearest" needs a fix to sort against; saying so up front beats
                silently returning the same order as before. */}
            {sortBy === "distance" && !coords ? (
              <Muted>Turn on location for this to take effect.</Muted>
            ) : null}

            <Text style={styles.groupLabel}>Brand experience</Text>
            <View style={styles.chipRow}>
              {VEHICLE_BRANDS.map((b) => (
                <Pressable key={b} onPress={() => toggle(b, brands, setBrands)}>
                  <View style={[styles.chip, brands.includes(b) && styles.chipOn]}>
                    <Text style={[styles.chipText, brands.includes(b) && styles.chipTextOn]}>{b}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Text style={styles.groupLabel}>Motorcycle type</Text>
            <View style={styles.chipRow}>
              {BIKE_TYPES.map((t) => (
                <Pressable key={t} onPress={() => toggle(t, types, setTypes)}>
                  <View style={[styles.chip, types.includes(t) && styles.chipOn]}>
                    <Text style={[styles.chipText, types.includes(t) && styles.chipTextOn]}>{t}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.filterActions}>
              <Button title="Apply filters" onPress={() => setApplied((n) => n + 1)} />
              {activeFilters || sortBy !== "best" ? (
                <Button title="Clear" variant="outline" onPress={clearFilters} />
              ) : null}
            </View>
          </View>
        ) : null}
      </Card>

      {error ? <ErrorNote message={error} onRetry={reload} /> : null}

      {!error && visible.length === 0 ? (
        <Empty
          message={
            query
              ? "No workshops match that search."
              : activeFilters
              ? "No workshops match those filters."
              : "No workshops listed yet."
          }
        />
      ) : null}

      {visible.map((w) => (
        <Pressable key={w._id} onPress={() => router.push(`/(customer)/workshop/${w._id}`)}>
          <Card>
            <View style={styles.row}>
              <View style={styles.main}>
                <Text style={styles.title}>{w.name}</Text>
                <Muted>{w.address || w.area || w.region || "Address not listed"}</Muted>
                <View style={styles.meta}>
                  {/* rating is an object on the Workshop model, and count is 0
                      for a workshop nobody has reviewed — an average of 0
                      there means "unrated", not "rated zero". */}
                  {w.rating?.count ? (
                    <Text style={styles.rating}>
                      {"★"} {(w.rating.average ?? 0).toFixed(1)} ({w.rating.count})
                    </Text>
                  ) : (
                    <Text style={styles.dim}>Not yet rated</Text>
                  )}
                  {typeof w.distanceKm === "number" ? (
                    <Text style={styles.dim}>{w.distanceKm.toFixed(1)} km away</Text>
                  ) : null}
                </View>

                {/* What the workshop actually covers — the reason a brand or
                    type filter matched, kept visible so the list explains
                    itself rather than looking arbitrary. */}
                {w.brandsSupported?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
                    {w.brandsSupported.map((b) => (
                      <View key={b} style={styles.tag}>
                        <Text style={styles.tagText}>{b}</Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  main: { flex: 1, gap: spacing.xs },
  title: { fontWeight: "700", color: colors.navy900, fontSize: 16 },
  meta: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  rating: { color: colors.orange500, fontWeight: "700", fontSize: 13 },
  dim: { color: colors.slate400, fontSize: 13 },
  filterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  filterBody: { marginTop: spacing.md, gap: spacing.sm },
  groupLabel: { fontWeight: "700", color: colors.navy900, fontSize: 13, marginTop: spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.navy900, borderColor: colors.navy900 },
  chipText: { color: colors.navy900, fontWeight: "600", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  filterActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  tagRow: { marginTop: spacing.xs },
  tag: {
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: spacing.xs,
  },
  tagText: { fontSize: 11, color: colors.slate600, fontWeight: "600" },
});
