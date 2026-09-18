import { useEffect, useRef, useState } from "react";
import "./ReasonDialog.css";

/**
 * "Tell us why" — the confirmation step for stopping a booking, used by the
 * customer cancelling (BookingsPage) and by a workshop rejecting
 * (AdminBookingsPage).
 *
 * Replaces window.confirm, which cannot collect text: the backend requires a
 * reason on both routes, so a confirm-only flow would have no way to supply
 * one. The confirm button stays disabled until the text clears
 * MIN_REASON_LENGTH, mirroring the server's own floor so the user finds out
 * before the round trip rather than after it.
 *
 * Mirrors mobile/src/components/ReasonDialog.tsx — same rules, same copy
 * slots, so the two clients ask the question the same way.
 */

// Must match MIN_REASON_LENGTH in backend_api/controllers/bookingController.js.
const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

interface ReasonDialogProps {
  open: boolean;
  title: string;
  /** One line of context above the box — what this reason will be used for. */
  message?: string;
  placeholder?: string;
  /** Label for the destructive action. */
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

function ReasonDialog({
  open,
  title,
  message,
  placeholder = "Tell them why…",
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clear and focus on open. Clearing on close instead would show the old text
  // wiping out as the dialog fades.
  useEffect(() => {
    if (!open) return;
    setReason("");
    // After paint, or the element isn't mounted yet to take focus.
    const id = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Escape closes, the way every other dismissable layer on the web does.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LENGTH;

  return (
    // Clicking the backdrop dismisses; the dialog stops the bubble so a click
    // inside never closes it.
    <div className="rd-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="rd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="rd-title" className="rd-title">{title}</h3>
        {message && <p className="rd-message">{message}</p>}

        <textarea
          ref={textareaRef}
          className="rd-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          maxLength={MAX_REASON_LENGTH}
          rows={4}
          disabled={busy}
        />

        <div className="rd-counter">
          {tooShort
            ? `At least ${MIN_REASON_LENGTH} characters`
            : `${trimmed.length}/${MAX_REASON_LENGTH}`}
        </div>

        <div className="rd-actions">
          <button type="button" className="uh-btn uh-btn-sm uh-btn-ghost" onClick={onCancel} disabled={busy}>
            Back
          </button>
          <button
            type="button"
            className="rd-confirm"
            onClick={() => onConfirm(trimmed)}
            disabled={tooShort || busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReasonDialog;
