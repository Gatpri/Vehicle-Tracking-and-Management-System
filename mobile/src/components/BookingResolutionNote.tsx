import { StyleSheet, Text, View } from "react-native";
import { statusLabel } from "../lib/bookingWorkflow";
import { CUSTOMER_ROLE } from "../lib/roles";
import type { BookingResolution } from "../lib/types";
import { colors, radius, spacing } from "../theme";

/**
 * Why a booking stopped, in the words of whoever stopped it.
 *
 * One component for both outcomes and every audience, because the record is
 * the same and only the phrasing changes: the customer reads "you cancelled",
 * the workshop and admins read "the customer cancelled", and a rejection
 * reads the same to everyone since only the workshop can reject.
 *
 * Renders nothing when there is no resolution, so callers can drop it into a
 * card unconditionally rather than repeating the same guard at each site.
 */

export interface BookingResolutionNoteProps {
  resolution?: BookingResolution | null;
  /** Whose screen this is — decides first or third person. */
  viewer: "customer" | "staff";
}

export function BookingResolutionNote({ resolution, viewer }: BookingResolutionNoteProps) {
  if (!resolution?.kind || !resolution.reason) return null;

  const byCustomer = resolution.byRole === CUSTOMER_ROLE;
  const heading =
    resolution.kind === "rejected"
      ? viewer === "customer"
        ? "The workshop rejected this booking"
        : "Rejected"
      : viewer === "customer"
        ? byCustomer
          ? "You cancelled this booking"
          : "The workshop cancelled this booking"
        : byCustomer
          ? "The customer cancelled"
          : "Cancelled by the workshop";

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.reason}>“{resolution.reason}”</Text>
      {/* Where it was stopped from matters: backing out of `pending` is a
          different thing from backing out with a van already on the way. */}
      {resolution.fromStatus ? (
        <Text style={styles.meta}>At: {statusLabel(resolution.fromStatus)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: "#fef2f2",
    borderLeftWidth: 3,
    borderLeftColor: colors.red500,
    gap: 2,
  },
  heading: { fontSize: 13, fontWeight: "700", color: colors.red500 },
  reason: { fontSize: 14, color: colors.navy900, lineHeight: 20 },
  meta: { fontSize: 11, color: colors.slate400, marginTop: 2 },
});
