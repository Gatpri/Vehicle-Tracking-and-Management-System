/**
 * Mirror of the web app's src/lib/workshopOptions.ts, which is itself a mirror
 * of backend_api/constants/workshopOptions.js. The backend copy is
 * authoritative (it validates writes); this one drives the pickers.
 *
 * Duplicated rather than imported because the mobile app is a separate Metro
 * project with its own module root — it cannot reach up into vite-project/.
 * If the backend list changes, all three move together.
 */

export const VEHICLE_BRANDS = [
  "Yamaha",
  "TVS",
  "KTM",
  "Honda",
  "Hero",
  "Benelli",
  "Royal Enfield",
  "Crossfire",
] as const;

export const BIKE_TYPES = ["sports", "dirt", "classic", "commuter", "scooter", "touring"] as const;

export type SortMode = "best" | "rating" | "sentiment" | "distance";

export const SORT_LABELS: Record<SortMode, string> = {
  best: "Best overall",
  rating: "Highest rated",
  sentiment: "Best reviews",
  distance: "Nearest",
};
