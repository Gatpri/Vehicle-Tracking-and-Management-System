import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import api from "./api";
import { getSocket } from "./socket";
import { useAuth } from "./AuthContext";
import type { NotificationItem } from "./types";

/**
 * Live notifications, shared by every role.
 *
 * The web app puts this in a bell in the header (NotificationBell.tsx) that is
 * mounted once per layout. Mobile needs the same thing available from several
 * screens at once — a customer's tab bar badge, an admin's drawer, the staff
 * dashboard — so it lives in a context rather than being refetched by each
 * screen that wants a count.
 *
 * The socket is the point: the web app already pushes "notification:new" to
 * `user:<id>` on every booking, delivery, quote and payment event, and mobile
 * was listening for none of them. Everything below is about receiving what the
 * backend has been sending all along.
 */
interface NotificationValue {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setItems([]);
      setUnread(0);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/notifications");
      setItems(res.data.notifications ?? []);
      // The server computes this; deriving it client-side would drift from
      // what a "read" actually means once pagination is involved.
      setUnread(res.data.unreadCount ?? 0);
    } catch {
      // A failed poll leaves the last known state rather than blanking the
      // bell — an empty list reads as "nothing happened", which is worse.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();

    // Every socket joins `user:<id>` on connect (config/socket.js), so this
    // needs no subscribe of its own.
    const onNew = (n: NotificationItem) => {
      setItems((prev) => [n, ...prev]);
      setUnread((u) => u + 1);
    };

    socket.on("notification:new", onNew);
    return () => {
      socket.off("notification:new", onNew);
    };
  }, [isAuthenticated]);

  const markRead = useCallback(async (id: string) => {
    // Updated locally first so the badge responds immediately; the request is
    // what makes it stick, and a failure is corrected by the next refresh.
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await api.patch("/notifications/read-all");
    } catch {
      refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ items, unread, loading, refresh, markRead, markAllRead }),
    [items, unread, loading, refresh, markRead, markAllRead]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

/**
 * Deliberately does NOT throw when there is no provider.
 *
 * Its only consumers are the three group layouts, which render an unread
 * badge. A badge is not worth crashing a screen for, and a layout can mount
 * before or outside the provider tree — during a route transition, or in a
 * context expo-router builds on its own. Throwing there turns a cosmetic
 * absence into a full render error with no useful message on the device.
 *
 * The fallback reports "nothing unread" and no-ops on the actions, which is
 * exactly right for a badge with no data behind it.
 */
const EMPTY: NotificationValue = {
  items: [],
  unread: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
};

export function useNotifications(): NotificationValue {
  return useContext(NotificationContext) ?? EMPTY;
}
