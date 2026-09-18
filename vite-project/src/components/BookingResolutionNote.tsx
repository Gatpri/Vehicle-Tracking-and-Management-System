import { statusLabel } from "../lib/bookingWorkflow";
import { CUSTOMER_ROLE } from "../lib/roles";
import "./BookingResolutionNote.css";

/**
 * Why a booking stopped, in the words of whoever stopped it.
 *
 * One component for both outcomes and every audience, because the record is
 * the same and only the phrasing changes: the customer reads "you cancelled",
 * the workshop and admins read "the customer cancelled", and a rejection reads
 * the same to everyone since only the workshop can reject.
 *
 * Renders nothing when there is no resolution, so callers can drop it into a
 * row unconditionally rather than repeating the same guard at each site.
 *
 * Mirrors mobile/src/components/BookingResolutionNote.tsx.
 */

export interface BookingResolution {
  kind?: "cancelled" | "rejected" | null;
  reason?: string;
  byRole?: string;
  at?: string | null;
  /** The status the booking was stopped out of. */
  fromStatus?: string;
}

interface BookingResolutionNoteProps {
  resolution?: BookingResolution | null;
  /** Whose screen this is — decides first or third person. */
  viewer: "customer" | "staff";
  /** Set on the admin shell, whose panels are near-black. */
  dark?: boolean;
}

function BookingResolutionNote({ resolution, viewer, dark = false }: BookingResolutionNoteProps) {
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
    <div className={dark ? "brn brn-dark" : "brn"}>
      <span className="brn-heading">{heading}</span>
      <p className="brn-reason">“{resolution.reason}”</p>
      {/* Where it was stopped from matters: backing out of `pending` is a
          different thing from backing out with a van already on the way. */}
      {resolution.fromStatus && (
        <span className="brn-meta">
          At: {statusLabel(resolution.fromStatus)}
          {resolution.at && ` · ${new Date(resolution.at).toLocaleString()}`}
        </span>
      )}
    </div>
  );
}

export default BookingResolutionNote;
