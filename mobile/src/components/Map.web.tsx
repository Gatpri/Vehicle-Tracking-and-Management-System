import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";
import type { MapProps } from "./Map.types";

export type { MapPoint, MapProps } from "./Map.types";

/**
 * The map in a browser.
 *
 * react-native-maps has no web build — importing it in a browser bundle throws
 * at module load — so the web target needs its own implementation. This uses
 * Leaflet, which is what the existing web app (vite-project) already uses, so
 * the browser build looks like the site users already know.
 *
 * Leaflet is loaded from a CDN at runtime rather than bundled. That keeps it
 * out of the iOS and Android bundles entirely: this file is only ever included
 * in the web build, and adding leaflet as a dependency would put it in
 * node_modules for every platform for no reason.
 */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** Resolves once Leaflet is on `window`, loading it on first use. */
let leafletReady: Promise<any> | null = null;

const loadLeaflet = (): Promise<any> => {
  if (leafletReady) return leafletReady;

  leafletReady = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) {
      resolve(w.L);
      return;
    }

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

function MapBody({ points, path, route, style }: MapProps) {
  // The <div> Leaflet mounts into. RN's View forwards `ref` to the underlying
  // DOM node on web, so this is a real HTMLElement at runtime.
  const container = useRef<any>(null);
  const map = useRef<any>(null);
  const layers = useRef<any[]>([]);

  const first = points[0] ?? path?.[0];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!first || !container.current) return;

      let L: any;
      try {
        L = await loadLeaflet();
      } catch {
        // Offline, or the CDN is blocked. The empty block below is what the
        // user sees; a map is never the only way to read this data.
        return;
      }
      if (cancelled || !container.current) return;

      if (!map.current) {
        map.current = L.map(container.current).setView([first.lat, first.lng], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map.current);
      }

      // Markers and the track are cleared and redrawn together, so a position
      // update never leaves a stale pin behind.
      layers.current.forEach((layer) => map.current.removeLayer(layer));
      layers.current = [];

      points.forEach((p) => {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 8,
          color: p.color ?? colors.blue700,
          fillColor: p.color ?? colors.blue700,
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(map.current);

        if (p.title || p.description) {
          marker.bindPopup(`<strong>${p.title ?? ""}</strong><br/>${p.description ?? ""}`);
        }
        layers.current.push(marker);
      });

      // Where the rider has been: muted, so it reads as history rather than
      // competing with the road ahead.
      if (path && path.length > 1) {
        const line = L.polyline(
          path.map((p) => [p.lat, p.lng]),
          { color: colors.slate400, weight: 4, opacity: 0.65 }
        ).addTo(map.current);
        layers.current.push(line);
      }

      // The road ahead, drawn as a casing plus a lighter core so it stays
      // legible over both pale streets and dark parkland. Matches the native
      // map and the web app's LiveDeliveryMap.
      if (route && route.length > 1) {
        const coords = route.map((p) => [p.lat, p.lng] as [number, number]);
        const casing = L.polyline(coords, { color: "#1e40af", weight: 9, opacity: 0.9 }).addTo(map.current);
        const core = L.polyline(coords, { color: "#4285f4", weight: 6 }).addTo(map.current);
        layers.current.push(casing, core);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points, path, route, first]);

  // Tear the map down only when the component itself goes away — not on every
  // data change, which the effect above handles by redrawing layers.
  useEffect(() => {
    return () => {
      map.current?.remove();
      map.current = null;
      layers.current = [];
    };
  }, []);

  if (!first) return <View style={[styles.map, styles.empty, style]} />;

  return <View ref={container} style={[styles.map, style]} />;
}

/**
 * Same contract as the native map: an expand control that opens the map
 * full-screen. The browser build gets it too, so a phone using the Expo web
 * build is not left with the one map it cannot enlarge.
 *
 * A separate Leaflet instance is mounted inside the overlay rather than the
 * inline one being moved: re-parenting a live Leaflet container leaves it with
 * stale pane dimensions and a grey half-rendered map until the next resize.
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
          accessibilityRole="button"
          accessibilityLabel="Open map full screen"
        >
          <Text style={styles.expandGlyph}>⛶</Text>
        </Pressable>
      ) : null}

      {fullscreen ? (
        <View style={styles.fsOverlay}>
          <View style={styles.fsHeader}>
            <Text style={styles.fsTitle} numberOfLines={1}>{title ?? "Map"}</Text>
            <Pressable onPress={() => setFullscreen(false)} accessibilityRole="button" accessibilityLabel="Close full screen map">
              <Text style={styles.fsClose}>✕</Text>
            </Pressable>
          </View>
          <MapBody {...props} style={styles.fsMap} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  map: { width: "100%", height: 260, borderRadius: radius.md, overflow: "hidden" },
  empty: { backgroundColor: colors.slate100 },

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
  },
  expandGlyph: { fontSize: 16, color: colors.navy900 },

  // "fixed" is web-only and exactly right here: the overlay must escape any
  // scrolling ancestor and cover the viewport.
  fsOverlay: {
    position: "fixed" as unknown as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    zIndex: 1000,
  },
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
  fsMap: { flex: 1, width: "100%", height: undefined, borderRadius: 0 },
});
