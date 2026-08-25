import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { colors, radius, spacing } from "../theme";
import type { LatLng, LocationPickerProps } from "./LocationPicker.types";

/**
 * Pick a point on a map, in a browser.
 *
 * react-native-maps has no web build, so the Expo web target needs its own
 * implementation — the same split, and the same reason, as Map.web.tsx. This
 * uses Leaflet loaded from a CDN at runtime, which keeps it out of the iOS and
 * Android bundles entirely.
 *
 * Same three ways in as the native version: click the map, drag the marker, or
 * use the device position.
 */
const KATHMANDU: LatLng = { lat: 27.7172, lng: 85.324 };

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let leafletReady: Promise<any> | null = null;

const loadLeaflet = (): Promise<any> => {
  if (leafletReady) return leafletReady;

  leafletReady = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return leafletReady;
};

export function LocationPicker({ value, onChange, onAddressResolved, height = 260 }: LocationPickerProps) {
  const container = useRef<any>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const [locating, setLocating] = useState(false);

  // Held in a ref so the map's click handler — registered once — always calls
  // the current onChange rather than the one captured on first render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAddressRef = useRef(onAddressResolved);
  onAddressRef.current = onAddressResolved;

  const resolveAddress = async (point: LatLng) => {
    if (!onAddressRef.current) return;
    try {
      const [place] = await Location.reverseGeocodeAsync({
        latitude: point.lat,
        longitude: point.lng,
      });
      if (place) {
        onAddressRef.current(
          [place.name, place.street, place.district, place.city].filter(Boolean).join(", ")
        );
      }
    } catch {
      // Convenience only; the coordinates are what get submitted.
    }
  };

  const setPoint = (point: LatLng) => {
    onChangeRef.current(point);
    resolveAddress(point);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!container.current) return;
      let L: any;
      try {
        L = await loadLeaflet();
      } catch {
        return; // offline or CDN blocked — the GPS button still works
      }
      if (cancelled || !container.current || map.current) return;

      const start = value ?? KATHMANDU;
      map.current = L.map(container.current).setView([start.lat, start.lng], value ? 15 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map.current);

      map.current.on("click", (e: any) => setPoint({ lat: e.latlng.lat, lng: e.latlng.lng }));
    })();

    return () => {
      cancelled = true;
    };
    // Runs once: the map is created here and updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in step with `value`, wherever it was set from.
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map.current) return;

    if (!value) {
      if (marker.current) {
        map.current.removeLayer(marker.current);
        marker.current = null;
      }
      return;
    }

    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { draggable: true }).addTo(map.current);
      marker.current.on("dragend", () => {
        const p = marker.current.getLatLng();
        setPoint({ lat: p.lat, lng: p.lng });
      });
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
    map.current.panTo([value.lat, value.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  useEffect(() => {
    return () => {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      // Denied or unavailable; the map is still usable by clicking.
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View ref={container} style={[styles.mapBox, { height }]} />

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

      <Text style={styles.dragHint}>
        {value ? "Drag the pin to adjust." : "Click the map to drop a pin."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  mapBox: { width: "100%", borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.slate100 },
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
