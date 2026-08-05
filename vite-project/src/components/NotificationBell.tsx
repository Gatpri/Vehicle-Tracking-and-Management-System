import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { getSocket } from "../lib/socket";
import "./NotificationBell.css";

interface AppNotification {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// Icons carry the meaning at a glance so the panel is scannable without
// reading every title.
const TYPE_ICON: Record<string, string> = {
  "quote:received": "🧾",
  "quote:responded": "✏️",
  "quote:accepted": "✅",
  "booking:status": "🔧",
  "theft:sighting": "🚨",
  general: "🔔",
};

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await api.get("/notifications");
      setItems(res.data.notifications);
      setUnread(res.data.unreadCount);
    } catch {
      // Signed out or offline — the bell just stays empty rather than
      // interrupting whatever the user is doing.
    }
  };

  useEffect(() => {
    // Initial fetch on mount is the intended behaviour here — this is exactly
    // the "subscribe to an external system" case the rule carves out, with the
    // fetch covering what the socket subscription can't see retroactively.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    // Live arrivals; the fetch above covers anything that landed while the
    // user was away, which sockets alone would have missed.
    const socket = getSocket();
    const onNew = (n: AppNotification) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((c) => c + 1);
    };
    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, []);

  // Click-outside to dismiss, so the panel doesn't trap the page.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((i) => (i._id === n._id ? { ...i, read: true } : i)));
      setUnread((c) => Math.max(0, c - 1));
      api.patch(`/notifications/${n._id}/read`).catch(() => load());
    }
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
    api.patch("/notifications/read-all").catch(() => load());
  };

  return (
    <div className="nb-wrap" ref={panelRef}>
      <button
        className="nb-button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      >
        🔔
        {unread > 0 && <span className="nb-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="nb-panel">
          <div className="nb-panel-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="nb-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="nb-empty">Nothing yet.</p>
          ) : (
            <div className="nb-list">
              {items.map((n) => (
                <button
                  key={n._id}
                  className={`nb-item ${n.read ? "" : "unread"}`}
                  onClick={() => openItem(n)}
                >
                  <span className="nb-item-icon">{TYPE_ICON[n.type] ?? TYPE_ICON.general}</span>
                  <span className="nb-item-body">
                    <span className="nb-item-title">{n.title}</span>
                    {n.body && <span className="nb-item-text">{n.body}</span>}
                    <span className="nb-item-time">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="nb-dot" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
