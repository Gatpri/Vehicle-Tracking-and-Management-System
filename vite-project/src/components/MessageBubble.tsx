import { useEffect, useRef, useState, type FormEvent } from "react";

export interface ChatMessage {
  _id: string;
  conversation: string;
  sender: string;
  text: string;
  createdAt: string;
  /** Set once the message has been edited. */
  editedAt?: string | null;
  /** Set when unsent. `text` is blanked at the same time. */
  deletedAt?: string | null;
  /** Previous versions, oldest first. Revealed by clicking "edited". */
  editHistory?: { text: string; editedAt: string }[];
}

/** How long after sending a message may still be edited — mirrors the server. */
export const EDIT_WINDOW_MS = 3 * 60 * 1000;

/**
 * Whether the edit control should still be offered.
 *
 * Checked against the client clock only to decide what to *show* — the server
 * re-checks and rejects a late edit regardless, so a wrong clock costs a
 * confusing error at worst, never an unauthorised edit.
 */
export const canStillEdit = (m: ChatMessage) =>
  !m.deletedAt && Date.now() - new Date(m.createdAt).getTime() <= EDIT_WINDOW_MS;

/**
 * One message in a thread, with its edit and unsend controls.
 *
 * Shared by the customer chat page and the admin one. Those two use different
 * CSS class prefixes (`ap-` and `adm-`), so the prefix is a prop rather than
 * the markup being duplicated — the behaviour here (the 3-minute window, the
 * deleted placeholder, the expandable history) is the part that must not
 * diverge between them.
 */
export function MessageBubble({
  message,
  mine,
  prefix,
  onEdit,
  onUnsend,
}: {
  message: ChatMessage;
  mine: boolean;
  /** CSS class prefix: "ap" on the customer page, "adm" on the admin one. */
  prefix: "ap" | "adm";
  onEdit: (id: string, text: string) => Promise<void>;
  onUnsend: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [showHistory, setShowHistory] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Close the ⋮ menu when clicking anywhere else. Without this a menu stays
  // open while you interact with the rest of the thread, and opening a second
  // one leaves the first hanging.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const cls = `${prefix}-msg ${mine ? `${prefix}-msg-mine` : `${prefix}-msg-theirs`}`;

  // An unsent message keeps its row so replies still make sense, but shows a
  // placeholder instead of the text.
  if (message.deletedAt) {
    return (
      <div className={cls}>
        <em style={{ opacity: 0.6 }}>This message was deleted</em>
      </div>
    );
  }

  if (editing) {
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      if (!draft.trim()) return;
      await onEdit(message._id, draft);
      setEditing(false);
    };
    return (
      <form onSubmit={submit} className={`${prefix}-msg-edit-row`}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button className="uh-btn uh-btn-primary uh-btn-sm" type="submit">Save</button>
        <button className="uh-btn uh-btn-ghost uh-btn-sm" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className={cls}>
      {message.text}

      {message.editedAt && (
        <>
          {" "}
          {/* Clicking "edited" reveals what it said before — visible to
              everyone in the thread, which is what makes the marker worth
              showing at all. */}
          <button
            type="button"
            className={`${prefix}-msg-edited`}
            onClick={() => setShowHistory((s) => !s)}
            title="Show previous versions"
          >
            (edited)
          </button>
        </>
      )}

      {showHistory && (message.editHistory?.length ?? 0) > 0 && (
        <div className={`${prefix}-msg-history`}>
          {message.editHistory!.map((h, i) => (
            <div key={i}>
              <span style={{ textDecoration: "line-through", opacity: 0.75 }}>{h.text}</span>
              <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>
                {new Date(h.editedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {mine && (
        <div className={`${prefix}-msg-menu-wrap`} ref={menuWrapRef}>
          {/* A ⋮ button rather than hover-revealed controls: hover does not
              exist on touch, and it hides the fact that the actions are there
              at all until you happen to point at the right place. */}
          <button
            type="button"
            className={`${prefix}-msg-dots`}
            aria-label="Message actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮
          </button>

          {menuOpen && (
            <div className={`${prefix}-msg-menu`} role="menu">
              {canStillEdit(message) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDraft(message.text);
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onUnsend(message._id);
                }}
              >
                Unsend
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
