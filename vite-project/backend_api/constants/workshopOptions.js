// The brands and motorcycle types a workshop can declare experience with.
// Imported by the Workshop schema, the filter API and both UIs so the three
// can never drift apart — adding a brand means editing this list only.
//
// The frontend has a mirror of this at src/lib/workshopOptions.ts. Keep the
// two in sync; the backend copy is authoritative because it validates writes.

export const VEHICLE_BRANDS = [
  "Yamaha",
  "TVS",
  "KTM",
  "Honda",
  "Hero",
  "Benelli",
  "Royal Enfield",
  "Crossfire",
];

export const BIKE_TYPES = ["sports", "dirt", "classic", "commuter", "scooter", "touring"];

// A workshop that has declared nothing is "unspecified", not "services
// everything" — silently including it in a Yamaha-only search would be a
// worse lie than leaving it out. The API groups these separately instead.
export const isUnspecified = (list) => !Array.isArray(list) || list.length === 0;
