import type { ViewStyle } from "react-native";

/**
 * Shared between Map.native.tsx and Map.web.tsx.
 *
 * These live in their own file rather than in one of the implementations
 * because a `.native`/`.web` pair is resolved by the bundler per platform —
 * so neither file can import types from the other without dragging in its
 * implementation too.
 */
export interface MapPoint {
  lat: number;
  lng: number;
  title?: string;
  description?: string;
  /** Marker tint. Defaults to the app blue. */
  color?: string;
  /**
   * Draw this point as a moving vehicle rather than a dropped pin.
   *
   * "arrow" is the rider's own position: a navigation arrow that rotates with
   * `heading`, so "up" is the way they are facing. The other values are the
   * vehicle being delivered, shown to everyone watching — the glyph stays
   * upright and only a small arrow indicates travel, because a rotated car
   * reads as "crashed" on a north-up map.
   */
  kind?: "arrow" | "car" | "bike" | "scooter" | "truck";
  /** Degrees clockwise from north. Rotates `kind: "arrow"`. */
  heading?: number | null;
}

export interface MapProps {
  points: MapPoint[];
  /** An ordered track to draw as a line — where the rider has already been. */
  path?: { lat: number; lng: number }[];
  /**
   * The road ahead, from the current position to the destination. Drawn in
   * bright blue on top of `path`, which is muted: the route still to drive is
   * what anyone watching actually cares about.
   */
  route?: { lat: number; lng: number }[];
  /**
   * Keep the camera on this coordinate as it moves. Used by the rider's own
   * navigation view, where the map should follow them rather than sit still
   * while they drive off the edge of it.
   */
  followCoordinate?: { lat: number; lng: number } | null;
  /**
   * Show an expand control that opens the map in a full-screen modal.
   *
   * On by default: a 240px map inside a scrolling card is fine for a glance
   * but useless for actually reading a route, and every consumer map app
   * offers this. Pass `false` where a map is purely decorative.
   */
  expandable?: boolean;
  /** Title shown in the full-screen header. */
  title?: string;
  style?: ViewStyle;
}
