import { useEffect, useState } from "react";
import api from "../../lib/api";
import { BOOKING_STATUS, isFinished } from "../../lib/bookingWorkflow";

/**
 * Loads the signed-in customer's own figures for the homepage.
 *
 * Every endpoint here is a "…/mine" route the customer already has permission
 * for, so this adds no new backend surface. Requests run in parallel and each
 * one is allowed to fail independently: a wallet outage should dim one tile,
 * not blank the whole page, so failures resolve to a null section rather than
 * rejecting the batch.
 */

export interface HomeVehicle {
  _id: string;
  plateNumber: string;
  make: string;
  model: string;
  status: "active" | "stolen" | "inactive";
  images?: string[];
}

export interface HomeBooking {
  _id: string;
  status: string;
  createdAt: string;
  vehicle?: { plateNumber?: string; make?: string; model?: string } | null;
  workshop?: { name?: string } | null;
}

export interface HomeData {
  loading: boolean;
  vehicles: HomeVehicle[];
  bookings: HomeBooking[];
  /** Non-terminal bookings: everything not finished/cancelled. */
  activeBookings: HomeBooking[];
  /**
   * Bookings still being worked on — active minus `completed`.
   *
   * `completed` is non-terminal (the vehicle still has to come back), but to a
   * customer it reads as done. Counting those under "Active Bookings" made a
   * real account show 11 active when 10 were finished jobs awaiting return, so
   * the two are surfaced separately instead.
   */
  inProgressBookings: HomeBooking[];
  /** Wallet balance in paisa, exactly as the API stores it. */
  walletPaisa: number | null;
  openSosCount: number;
  unreadNotifications: number;
}

/** Resolve a request to `null` instead of throwing, so one outage can't blank the page. */
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export function useHomeData(): HomeData {
  const [state, setState] = useState<HomeData>({
    loading: true,
    vehicles: [],
    bookings: [],
    activeBookings: [],
    inProgressBookings: [],
    walletPaisa: null,
    openSosCount: 0,
    unreadNotifications: 0,
  });

  useEffect(() => {
    // Guards against setting state after the user navigates away mid-flight.
    let alive = true;

    (async () => {
      const [vehRes, bookRes, walletRes, sosRes, notifRes] = await Promise.all([
        soft(api.get("/vehicles/mine")),
        soft(api.get("/bookings/mine")),
        soft(api.get("/wallet")),
        soft(api.get("/sos/mine")),
        soft(api.get("/notifications")),
      ]);

      if (!alive) return;

      const vehicles: HomeVehicle[] = vehRes?.data?.vehicles ?? [];
      const bookings: HomeBooking[] = bookRes?.data?.bookings ?? [];
      // isFinished() is the shared workflow helper (finished | cancelled) —
      // reused rather than re-listing the statuses here, so this cannot drift
      // from the backend definition the rest of the app follows.
      const activeBookings = bookings.filter((b) => !isFinished(b.status));
      const inProgressBookings = activeBookings.filter(
        (b) => b.status !== BOOKING_STATUS.COMPLETED
      );

      const alerts: Array<{ status?: string }> = sosRes?.data?.alerts ?? [];

      setState({
        loading: false,
        vehicles,
        bookings,
        activeBookings,
        inProgressBookings,
        // null (not 0) when the wallet call failed, so the tile can say
        // "unavailable" instead of confidently displaying Rs 0.00.
        walletPaisa: walletRes ? walletRes.data?.wallet?.balance ?? 0 : null,
        openSosCount: alerts.filter((a) => a.status && a.status !== "resolved").length,
        // The API's own count, not a tally of the returned array: that list is
        // capped at 50, so counting it would silently understate a busy inbox.
        unreadNotifications: notifRes?.data?.unreadCount ?? 0,
      });
    })();

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
