import { Platform } from "react-native";

/**
 * Where the native maps get their tiles.
 *
 * PROVIDER_DEFAULT means Apple Maps on iOS and Google Maps on Android. Apple
 * Maps needs no credentials, which is why iOS has always worked; the Google
 * Maps Android SDK refuses to draw without an API key and fails *silently* —
 * a black square with a Google watermark and no error in the log.
 *
 * Rather than take on a billable Google key, Android overlays raster tiles
 * from OpenStreetMap. That is the same source the web app uses (see
 * vite-project/src/components/LocationPicker.tsx, which says "no API key" in
 * as many words), so all three clients draw the same map. The Google layer is
 * still underneath, hidden by the overlay, and continues to supply gestures,
 * projection and coordinates.
 *
 * Shared by Map.native.tsx and LocationPicker.native.tsx so the two cannot
 * drift — both must switch together or a user sees two different maps.
 */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** OSM's deepest raster zoom. Past 19 the server 404s and the map goes blank. */
export const OSM_MAX_ZOOM = 19;

export const useOsmTiles = Platform.OS === "android";

/**
 * With the overlay on, the base layer must draw nothing: Google's own labels
 * bleed through the tiles' transparent pixels and double up with OSM's.
 */
export const baseMapType = useOsmTiles ? ("none" as const) : ("standard" as const);
