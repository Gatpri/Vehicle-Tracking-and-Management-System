import { useEffect, useRef, useState } from "react";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";
import type { MapPoint, MapProps } from "./Map.types";

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
/**
 * Emoji rather than an icon font or SVG.
 *
 * react-native-svg and @expo/vector-icons are both absent from this project,
 * and adding a native dependency to draw four small glyphs would mean every
 * contributor rebuilding their dev client. Emoji render identically inside a
 * <Text> on both platforms, need no asset pipeline, and stay crisp at any
 * density — the pragmatic choice for a marker this size.
 */
/**
 * The navigation chevron, pre-rendered at every 15°.
 *
 * Rotating the marker at runtime failed three separate ways on this setup (see
 * the notes on the Marker below), all of which came down to the same thing: the
 * only safe marker is one with no child view, and such a marker's angle is
 * fixed when its native annotation view is created.
 *
 * So the angle is baked into the asset instead. Swapping `image` for a
 * pre-rotated frame IS honoured on re-render — it is an ordinary prop change on
 * an existing marker, with nothing to rasterise and nothing to re-anchor.
 *
 * 24 frames, ~32 KB in total. Every require() is static because Metro resolves
 * asset paths at build time and cannot take a computed string.
 */
const NAV_FRAMES = [
  require("../../assets/nav/arrow-000.png"),
  require("../../assets/nav/arrow-015.png"),
  require("../../assets/nav/arrow-030.png"),
  require("../../assets/nav/arrow-045.png"),
  require("../../assets/nav/arrow-060.png"),
  require("../../assets/nav/arrow-075.png"),
  require("../../assets/nav/arrow-090.png"),
  require("../../assets/nav/arrow-105.png"),
  require("../../assets/nav/arrow-120.png"),
  require("../../assets/nav/arrow-135.png"),
  require("../../assets/nav/arrow-150.png"),
  require("../../assets/nav/arrow-165.png"),
  require("../../assets/nav/arrow-180.png"),
  require("../../assets/nav/arrow-195.png"),
  require("../../assets/nav/arrow-210.png"),
  require("../../assets/nav/arrow-225.png"),
  require("../../assets/nav/arrow-240.png"),
  require("../../assets/nav/arrow-255.png"),
  require("../../assets/nav/arrow-270.png"),
  require("../../assets/nav/arrow-285.png"),
  require("../../assets/nav/arrow-300.png"),
  require("../../assets/nav/arrow-315.png"),
  require("../../assets/nav/arrow-330.png"),
  require("../../assets/nav/arrow-345.png"),
];

/** The frame closest to a heading, wrapping 352.5°-360° back round to 0. */
const arrowFrameFor = (deg?: number | null) => {
  if (typeof deg !== "number") return NAV_FRAMES[0];
  const norm = ((deg % 360) + 360) % 360;
  return NAV_FRAMES[Math.round(norm / 15) % NAV_FRAMES.length];
};

const VEHICLE_EMOJI: Record<string, string> = {
  car: "🚗",
  bike: "🏍️",
  scooter: "🛵",
  truck: "🚚",
};

/**
 * The vehicle being delivered, as everyone except the rider sees it.
 *
 * The rider's own arrow is NOT rendered here: it is an `image` marker (see the
 * Marker below), because an image can be rotated natively without the view
 * being re-rasterised. This view never rotates — an observer reads a north-up
 * map, and a rotated car reads as "crashed" — so it captures once and stops.
 */
function VehicleMarker({ point }: { point: MapPoint }) {
  return (
    <View style={styles.vehicleWrap}>
      <View style={styles.vehicleDisc}>
        <Text style={styles.vehicleGlyph}>{VEHICLE_EMOJI[point.kind ?? "car"] ?? VEHICLE_EMOJI.car}</Text>
      </View>
    </View>
  );
}

/**
 * The map itself. Split out from `Map` so the identical map can be rendered
 * twice — inline in a card, and again inside the full-screen modal — without
 * duplicating markers, polylines and camera logic.
 */
function MapBody({ points, path, route, followCoordinate, style }: MapProps) {
  const first = points[0] ?? path?.[0];
  const mapRef = useRef<MapView | null>(null);

  // tracksViewChanges is what causes the flicker, so it has to end up false —
  // but switching it off immediately risks the opposite bug: the marker bitmap
  // is captured once, and if that happens before the custom view has laid out,
  // the marker stays blank for the life of the screen. Tracking for a beat and
  // then stopping gives the view time to render, then freezes it.
  const [capturing, setCapturing] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setCapturing(false), 1200);
    return () => clearTimeout(t);
  }, []);

  // Keep the camera on the rider as they move. animateCamera (rather than
  // setting `region`) leaves the user free to pan away between updates instead
  // of snapping the view back on every render.
  // Set once, on the first fix, so the view starts at a navigation zoom rather
  // than wherever initialRegion happened to land. Not re-applied afterwards:
  // forcing the zoom on every update would undo the rider pinching to look
  // ahead, which is the main thing they do with this map.
  const zoomApplied = useRef(false);

  useEffect(() => {
    if (!followCoordinate) return;
    const center = { latitude: followCoordinate.lat, longitude: followCoordinate.lng };
    if (!zoomApplied.current) {
      zoomApplied.current = true;
      // zoom 16 is the street-level view a navigation app opens at.
      mapRef.current?.animateCamera({ center, zoom: 16 }, { duration: 500 });
      return;
    }
    mapRef.current?.animateCamera({ center }, { duration: 700 });
  }, [followCoordinate?.lat, followCoordinate?.lng]);

  // True when this map already draws the rider's own position as an arrow, in
  // which case the platform's blue dot would duplicate it.
  const hasOwnPositionMarker = points.some((p) => p.kind === "arrow");



  // With nothing to show, render a neutral block rather than a world map
  // centred on the ocean, which looks like a bug.
  if (!first) return <View style={[styles.map, styles.empty, style]} />;

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_DEFAULT}
      style={[styles.map, style]}
      // `region` would re-centre on every render and fight the user panning;
      // initialRegion sets the starting view and then leaves them alone.
      initialRegion={{
        latitude: first.lat,
        longitude: first.lng,
        // Navigation zooms in much closer than an overview map: ~600m across
        // when the rider's own arrow is on screen, so street names are legible
        // and the arrow is clearly moving along a road rather than drifting
        // over a region. Other maps keep the ~2km overview.
        latitudeDelta: hasOwnPositionMarker ? 0.006 : 0.02,
        longitudeDelta: hasOwnPositionMarker ? 0.006 : 0.02,
      }}
      // Off whenever we are drawing the rider ourselves: the OS blue dot marks
      // the same position as our arrow, so both appear at once — the arrow and
      // a second blue dot a few metres apart, which reads as two vehicles.
      // Still on for maps with no rider marker (the heatmap, staff locations),
      // where "where am I" is genuinely useful.
      showsUserLocation={!hasOwnPositionMarker}
      showsMyLocationButton={!hasOwnPositionMarker}
    >
      {points.map((p, i) => (
        <Marker
          // Stable, positional identity. It deliberately does NOT include the
          // heading: keying on it remounted the marker on every turn, which
          // tears down and recreates the native annotation view while it is
          // still rasterising its bitmap — a use-after-free on the native side
          // that crashed the app outright when the rider rotated the phone.
          key={`marker-${i}`}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          // Only dropped pins get a callout. On a moving marker the bubble
          // opens by itself when the marker is re-added and then sits on top
          // of the arrow — the title survives as an accessibility label.
          {...(p.kind ? {} : { title: p.title, description: p.description })}
          accessibilityLabel={p.title}
          // A plain dropped pin unless this point is a moving vehicle.
          {...(p.kind ? {} : { pinColor: p.color ?? colors.blue700 })}
          // Centres the marker on the coordinate; the default anchors a pin by
          // its tip, which would leave a glyph sitting above the position it
          // is meant to mark.
          {...(p.kind ? { anchor: { x: 0.5, y: 0.5 }, centerOffset: { x: 0, y: 0 } } : {})}
          // The rider's arrow is a pure IMAGE marker: a native image plus a
          // native rotation, with NO child view.
          //
          // That is the whole fix for the arrow jumping to the map's top-left
          // corner. A marker with children has to rasterise those children into
          // a bitmap, and iOS re-measures and re-anchors the annotation every
          // time it does — so a marker that re-captures as it turns is
          // permanently unstable, whatever its bounds are. Wrapping the image
          // in a fixed-size View did not help, because the re-anchor happens on
          // the capture itself, not on a size change.
          //
          // With `image` there is nothing to capture: the map is handed a ready
          // -made bitmap and rotates it natively. `rotation` reaches the native
          // view on every render (MapMarker spreads {...this.props}), so the
          // arrow turns without a remount, without a native command, and
          // without tracksViewChanges.
          //
          // `flat` lays it against the map surface; without it the marker is
          // billboarded upright to the screen and rotation is ignored.
          {...(p.kind === "arrow"
            ? {
                // The angle lives in the asset, not in a prop — see
                // NAV_FRAMES above for why.
                image: arrowFrameFor(p.heading),
                flat: true,
              }
            : {})}
          // Approaches that failed before the image marker above, kept so
          // they are not retried:
          //
          //   rotation + child view — the child had to be rasterised, and iOS
          //                           re-anchors the annotation on every
          //                           capture, so the arrow jumped to the
          //                           map's top-left corner as it turned. A
          //                           fixed-size wrapper did not help: the
          //                           re-anchor follows the capture, not a
          //                           change of bounds.
          //   heading in the key    — forced a remount, tearing the view down
          //                           mid-rasterise, which crashed the app.
          //   marker.redraw()       — a legacy view-manager command absent
          //                           under the New Architecture
          //                           (newArchEnabled), so it threw
          //                           "No command found with name redraw".
          //
          // The arrow has no children to capture, so it never tracks. Vehicle
          // glyphs do have a child view; they capture once and then stop.
          tracksViewChanges={p.kind && p.kind !== "arrow" ? capturing : false}
        >
          {p.kind && p.kind !== "arrow" ? <VehicleMarker point={p} /> : undefined}
        </Marker>
      ))}

      {/* Where the rider has been: muted, so it reads as history. */}
      {path && path.length > 1 ? (
        <Polyline
          coordinates={path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={colors.slate400}
          strokeWidth={4}
        />
      ) : null}

      {/* The road ahead. Two passes — a darker casing under a lighter core —
          which is how a route stays legible over both pale roads and parkland. */}
      {route && route.length > 1 ? (
        <>
          <Polyline
            coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor="#1e40af"
            strokeWidth={9}
          />
          <Polyline
            coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor="#4285f4"
            strokeWidth={6}
          />
        </>
      ) : null}
    </MapView>
  );
}

/**
 * A map, with an expand control that opens the same map full-screen.
 *
 * A 240px map inside a scrolling card is enough to confirm "the rider is
 * moving" but far too small to read a route on — and pinching it fights the
 * ScrollView for the gesture. Full-screen gives the map the whole device and
 * its own gesture space.
 */
export function Map(props: MapProps) {
  const { expandable = true, title, style } = props;
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <View style={styles.wrap}>
      <MapBody {...props} style={style} />

      {expandable ? (
        <Pressable
          style={styles.expandBtn}
          onPress={() => setFullscreen(true)}
          // The control is small, so the touch target is padded out to the
          // ~44px both platforms' guidelines ask for.
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Open map full screen"
        >
          <Text style={styles.expandGlyph}>⛶</Text>
        </Pressable>
      ) : null}

      {/* onRequestClose is what makes the Android hardware back button close
          this; without it the modal traps the user. */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}
        supportedOrientations={["portrait", "landscape"]}
      >
        <SafeAreaView style={styles.fsRoot}>
          <View style={styles.fsHeader}>
            <Text style={styles.fsTitle} numberOfLines={1}>
              {title ?? "Map"}
            </Text>
            <Pressable onPress={() => setFullscreen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close full screen map">
              <Text style={styles.fsClose}>✕</Text>
            </Pressable>
          </View>
          {/* Re-rendered rather than moved: a MapView cannot be reparented
              between the card and the modal, so the modal mounts its own. */}
          <MapBody {...props} style={styles.fsMap} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Positions the expand control against the map without affecting layout.
  wrap: { position: "relative" },
  map: { width: "100%", height: 260, borderRadius: radius.md },

  expandBtn: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  expandGlyph: { fontSize: 16, color: colors.navy900 },

  fsRoot: { flex: 1, backgroundColor: "#fff" },
  fsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  fsTitle: { fontSize: 16, fontWeight: "700", color: colors.navy900, flexShrink: 1 },
  fsClose: { fontSize: 20, color: colors.slate600, paddingHorizontal: 4 },
  // borderRadius 0: a rounded corner against a full-bleed screen edge looks
  // like a rendering fault rather than a design choice.
  fsMap: { flex: 1, width: "100%", height: undefined, borderRadius: 0 },
  empty: { backgroundColor: colors.slate100 },

  // Rider's own position, mirroring the web app's marker: a blue arrowhead on
  // a pale halo. The disc carries the rotation so the triangle turns about the
  // marker's centre rather than about its own tip.
  // The vehicle being delivered, as everyone watching sees it.
  vehicleWrap: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  vehicleDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.blue700,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  vehicleGlyph: { fontSize: 16 },
});
