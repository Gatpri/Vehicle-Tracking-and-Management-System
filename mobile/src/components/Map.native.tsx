import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { StyleSheet, View } from "react-native";
import { colors, radius } from "../theme";
import type { MapProps } from "./Map.types";

export type { MapPoint, MapProps } from "./Map.types";

/**
 * The map on iOS and Android, replacing the web app's react-leaflet usage.
 *
 * Leaflet is a DOM library and does not run in React Native at all, so this is
 * one of the few places where the port is a genuine reimplementation rather
 * than a translation. react-native-maps renders the platform's own map —
 * Google Maps on Android, Apple Maps on iOS — which is faster and smoother
 * than an embedded web map.
 *
 * This file is `.native` because react-native-maps has no web build at all:
 * importing it in a browser bundle throws at module load. Map.web.tsx is the
 * browser counterpart, and the bundler picks between them — every consumer
 * just imports "./Map".
 *
 * PROVIDER_DEFAULT is deliberate: it uses Apple Maps on iOS and Google Maps on
 * Android without requiring a Google Maps API key on iOS. Android still needs
 * a key for release builds — see README.md.
 */
export function Map({ points, path, style }: MapProps) {
  const first = points[0] ?? path?.[0];

  // With nothing to show, render a neutral block rather than a world map
  // centred on the ocean, which looks like a bug.
  if (!first) return <View style={[styles.map, styles.empty, style]} />;

  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={[styles.map, style]}
      // `region` would re-centre on every render and fight the user panning;
      // initialRegion sets the starting view and then leaves them alone.
      initialRegion={{
        latitude: first.lat,
        longitude: first.lng,
        // ~2km across, close enough to read streets without hunting.
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
      showsUserLocation
      showsMyLocationButton
    >
      {points.map((p, i) => (
        <Marker
          key={`${p.lat},${p.lng},${i}`}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          title={p.title}
          description={p.description}
          pinColor={p.color ?? colors.blue700}
        />
      ))}

      {path && path.length > 1 ? (
        <Polyline
          coordinates={path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={colors.blue700}
          strokeWidth={4}
        />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: 260, borderRadius: radius.md },
  empty: { backgroundColor: colors.slate100 },
});
