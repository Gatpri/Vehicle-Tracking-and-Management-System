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
}

export interface MapProps {
  points: MapPoint[];
  /** An ordered track to draw as a line — a delivery route, for example. */
  path?: { lat: number; lng: number }[];
  style?: ViewStyle;
}
