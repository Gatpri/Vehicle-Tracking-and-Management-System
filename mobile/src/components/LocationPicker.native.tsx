import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from "react-native-maps";
import { OSM_TILE_URL, OSM_MAX_ZOOM, useOsmTiles, baseMapType } from "./mapTiles";
import * as Location from "expo-location";
import { colors, radius, spacing } from "../theme";
import { PlaceSearch } from "./PlaceSearch";
import type { LatLng, LocationPickerProps } from "./LocationPicker.types";

/**
 * Pick a point on a map — the native counterpart of the web app's
 * LocationPicker.
 *
 * Four ways in, matching the web version, because none of them covers every
 * case on its own:
 *
 *   Search a place   — you know the address but not where it is on a map.
 *   Tap the map      — the vehicle was taken from somewhere you are not.
 *   Drag the marker  — nudge the pin once it is roughly right.
 *   Use my location  — you are standing where it happened.
 *
 * The middle two are what this adds over the old "current location only"
 * button: a stolen vehicle is rarely taken from where the owner is standing
 * when they file the report, which is precisely the case this screen exists
 * for. Search matters for the other caller — an admin registering a workshop
 * is typically nowhere near the garage they are adding.
 */
const KATHMANDU: LatLng = { lat: 27.7172, lng: 85.324 };

export function LocationPicker({ value, onChange, onAddressResolved, height = 260 }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Recentre when the point is set from outside — pressing "Use my location"
  // must move the map, not just move the pin off-screen.
  useEffect(() => {
    if (!value) return;
    mapRef.current?.animateToRegion(
      { latitude: value.lat, longitude: value.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      300
    );
  }, [value?.lat, value?.lng]);

  /**
   * Turn a fix into something human-readable, so the person filing can tell at
   * a glance whether the pin is where they mean. Failure is silent: the
   * coordinates are what actually get submitted.
   */
  const resolveAddress = async (point: LatLng) => {
    if (!onAddressResolved) return;
    try {
      const [place] = await Location.reverseGeocodeAsync({
        latitude: point.lat,
        longitude: point.lng,
      });
      if (place) {
        onAddressResolved(
          [place.name, place.street, place.district, place.city].filter(Boolean).join(", ")
        );
      }
    } catch {
      // Reverse geocoding is a convenience, not a requirement.
    }
  };

  const setPoint = (point: LatLng) => {
    onChange(point);
    resolveAddress(point);
  };

  /** A search hit already carries a display name, so use it rather than
   *  spending a reverse-geocode to re-derive a worse one. */
  const setSearchedPoint = (point: LatLng, label: string) => {
    onChange(point);
    onAddressResolved?.(label);
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      // Location services off, or no fix. The map is still usable by tapping.
    } finally {
      setLocating(false);
    }
  };

  const start = value ?? KATHMANDU;

  return (
    <View style={styles.wrap}>
      {/* Above the map, as on the web: searching is how you get the map to the
          right part of the country before any tapping is worth doing. */}
      <View style={styles.toolbar}>
        <View style={styles.searchCell}>
          <PlaceSearch onPick={setSearchedPoint} />
        </View>
        <Pressable onPress={useMyLocation} style={styles.gpsBtn} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.navy900} />
          ) : (
            <Text style={styles.gpsText}>📍 My location</Text>
          )}
        </Pressable>
      </View>

      <View style={[styles.mapBox, { height }]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: start.lat,
            longitude: start.lng,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          // Tap anywhere to drop the pin there.
          onPress={(e) =>
            setPoint({
              lat: e.nativeEvent.coordinate.latitude,
              lng: e.nativeEvent.coordinate.longitude,
            })
          }
          // See mapTiles.ts: on Android the base layer draws nothing and OSM
          // tiles are overlaid, because Google Maps needs a key we don't ship.
          mapType={baseMapType}
        >
          {useOsmTiles ? (
            <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={OSM_MAX_ZOOM} shouldReplaceMapContent />
          ) : null}

          {value ? (
            <Marker
              coordinate={{ latitude: value.lat, longitude: value.lng }}
              draggable
              // Fires once the finger lifts, so the pin follows the drag and
              // only the final position is committed.
              onDragEnd={(e) =>
                setPoint({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })
              }
              pinColor={colors.red500}
            />
          ) : null}
        </MapView>

        {!value ? (
          // Shown only until a point exists — once there is a pin, the
          // instruction has served its purpose and would just cover the map.
          <View pointerEvents="none" style={styles.hint}>
            <Text style={styles.hintText}>Tap the map to drop a pin</Text>
          </View>
        ) : null}

        {/* OSM's tile policy requires visible attribution, which UrlTile has no
            prop for — the web picker passes it to Leaflet's TileLayer. */}
        {useOsmTiles ? (
          <View pointerEvents="none" style={styles.attribution}>
            <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
          </View>
        ) : null}
      </View>

      {value ? (
        <View style={styles.footer}>
          <Text style={styles.coords}>{`${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`}</Text>
          <Text style={styles.dragHint}>Drag the pin to adjust.</Text>
        </View>
      ) : (
        <Text style={styles.dragHint}>
          Search, tap the map, or use your location — then drag the pin to fine-tune.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  mapBox: { width: "100%", borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.slate100 },
  hint: {
    position: "absolute",
    top: spacing.md,
    alignSelf: "center",
    backgroundColor: "rgba(15,23,42,0.78)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  hintText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  attribution: {
    position: "absolute",
    right: 4,
    bottom: 3,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: 5,
    borderRadius: 3,
  },
  attributionText: { fontSize: 9, color: colors.slate600 },
  // The toolbar has to out-stack the map so the search dropdown draws over it.
  toolbar: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, zIndex: 20, elevation: 20 },
  searchCell: { flex: 1 },
  gpsBtn: {
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
  },
  gpsText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  coords: { color: colors.slate400, fontSize: 12 },
  dragHint: { color: colors.slate400, fontSize: 12, flexShrink: 1 },
});
