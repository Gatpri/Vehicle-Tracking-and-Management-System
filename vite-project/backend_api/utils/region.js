// Region is free text — it's typed into a prompt when a user is promoted, and
// entered by hand on a workshop — so "Chitwan", "chitwan" and " Chitwan " all
// reach the database exactly as written.
//
// Comparing or querying them raw silently hid every booking, staff member and
// delivery whose casing didn't match the viewing admin's own, which looked
// exactly like "the feature is broken" rather than a data mismatch. Every
// region check goes through these two helpers so the rule is defined once.

export const sameRegion = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// Case-insensitive, whitespace-tolerant equality for a Mongo query, so filters
// match the comparison above rather than being stricter than it.
export const regionQuery = (region) =>
  new RegExp(`^\\s*${String(region ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
