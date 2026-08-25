import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
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

export function Map({ points, path, style }: MapProps) {
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

      if (path && path.length > 1) {
        const line = L.polyline(
          path.map((p) => [p.lat, p.lng]),
          { color: colors.blue700, weight: 4 }
        ).addTo(map.current);
        layers.current.push(line);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points, path, first]);

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

const styles = StyleSheet.create({
  map: { width: "100%", height: 260, borderRadius: radius.md, overflow: "hidden" },
  empty: { backgroundColor: colors.slate100 },
});
