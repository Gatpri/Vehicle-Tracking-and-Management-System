import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, shadow, spacing } from "../theme";
import type { LatLng } from "./LocationPicker.types";

/**
 * Search a place by name and drop the pin on it.
 *
 * Shared by both halves of the platform-split LocationPicker: the search is
 * plain fetch + state, so unlike the map itself it needs no per-platform
 * implementation, and keeping it here means the debounce rules live in one
 * place rather than drifting between the native and web files.
 *
 * Geocoding goes through Nominatim, the same keyless endpoint the web app's
 * LocationPicker.tsx uses, so a search for "Bharatpur" lands on the same point
 * in both clients. expo-location's geocodeAsync would have been the native
 * route, but it returns no display names to choose between — which is the
 * whole point of a results list.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const SEARCH_DEBOUNCE_MS = 450;
const MIN_QUERY = 3;

/**
 * Nominatim's usage policy requires a User-Agent that identifies the app, and
 * it answers 403 to anything that doesn't have one.
 *
 * This matters only on Android: iOS sends a CFNetwork UA that gets through,
 * and the browser sets its own, so the web picker and the iOS build both
 * worked while Android silently returned no results — its OkHttp client sends
 * "okhttp/4.x", which Nominatim rejects outright.
 */
const USER_AGENT = "VehicleSafety/1.0 (https://github.com/Gatpri; vehicle theft platform)";

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
}

interface PlaceSearchProps {
  onPick: (point: LatLng, label: string) => void;
}

export function PlaceSearch({ onPick }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // Cleared on pick rather than on every keystroke: results for an abandoned
  // query stay in state until the next fetch resolves, and hiding them by
  // query length avoids a render per character.
  const visible = query.trim().length < MIN_QUERY ? [] : results;

  // Nominatim asks callers not to hammer it, so one request per pause in
  // typing — never one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        const res = await fetch(
          `${NOMINATIM}/search?format=json&limit=5&countrycodes=np&q=${encodeURIComponent(q)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          }
        );
        if (res.ok) {
          setResults(await res.json());
          setOpen(true);
        } else {
          // Say so rather than looking like "no such place". A rejected
          // request and a genuine zero-result search are different problems
          // and only one of them is the user's to fix.
          setResults([]);
          setFailed(true);
        }
      } catch (err) {
        // An abort is this effect cleaning up after itself, not a failure.
        if ((err as Error)?.name !== "AbortError") setFailed(true);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (hit: NominatimHit) => {
    onPick({ lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) }, hit.display_name);
    setQuery("");
    setResults([]);
    setOpen(false);
    setFailed(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a place or address…"
          placeholderTextColor={colors.slate400}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onFocus={() => visible.length > 0 && setOpen(true)}
          style={styles.input}
        />
        {searching ? <ActivityIndicator size="small" color={colors.slate400} style={styles.spinner} /> : null}
      </View>

      {open && visible.length > 0 ? (
        // Absolutely positioned so opening the list doesn't shove the map down
        // the screen mid-search.
        <View style={styles.results}>
          <FlatList
            data={visible}
            keyExtractor={(r) => `${r.lat},${r.lon}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => choose(item)}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
              >
                <Text style={styles.resultText} numberOfLines={2}>
                  {item.display_name}
                </Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {/* Search is one of four ways to set the pin, so a failure here is worth
          naming but not worth blocking on — the map and the coordinate fields
          still work. */}
      {failed && !searching ? (
        <Text style={styles.failed}>
          Place search is unavailable right now — tap the map instead.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex keeps the dropdown above the map that follows it in the tree;
  // Android needs the matching elevation for the same effect.
  wrap: { position: "relative", zIndex: 20, elevation: 20 },
  inputWrap: { justifyContent: "center" },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    paddingRight: 38,
    fontSize: 14,
    color: colors.slate900,
  },
  spinner: { position: "absolute", right: 12 },
  results: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 180,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.sm,
    overflow: "hidden",
    ...shadow(2),
  },
  result: { paddingHorizontal: 12, paddingVertical: 10 },
  resultPressed: { backgroundColor: colors.slate100 },
  resultText: { fontSize: 13, color: colors.slate900, lineHeight: 18 },
  failed: { fontSize: 12, color: colors.red500, marginTop: 6 },
});
