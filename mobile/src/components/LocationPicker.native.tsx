import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { colors, radius, spacing } from "../theme";
import type { LatLng, LocationPickerProps } from "./LocationPicker.types";

/**
 * Pick a point on a map — the native counterpart of the web app's
 * LocationPicker.
 *
 * Three ways in, matching the web version, because none of them covers every
 * case on its own:
 *
 *   Tap the map      — the vehicle was taken from somewhere you are not.
 *   Drag the marker  — nudge the pin once it is roughly right.
 *   Use my location  — you are standing where it happened.
 *
 * The first two are what this adds over the old "current location only"
 * button: a stolen vehicle is rarely taken from where the owner is standing
 * when they file the report, which is precisely the case this screen exists
 * for.
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
        >
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
      </View>

      <View style={styles.actions}>
        <Pressable onPress={useMyLocation} style={styles.gpsBtn} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.navy900} />
          ) : (
            <Text style={styles.gpsText}>Use my location</Text>
          )}
        </Pressable>
        {value ? <Text style={styles.coords}>{`${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`}</Text> : null}
      </View>

      {value ? <Text style={styles.dragHint}>Drag the pin to adjust.</Text> : null}
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
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  gpsBtn: {
    backgroundColor: colors.slate100,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  gpsText: { color: colors.navy900, fontWeight: "600", fontSize: 13 },
  coords: { color: colors.slate400, fontSize: 12, flexShrink: 1 },
  dragHint: { color: colors.slate400, fontSize: 12 },
});
