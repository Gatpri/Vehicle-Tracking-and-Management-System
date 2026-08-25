import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import LiveDeliveryMap from "../../components/LiveDeliveryMap";
import { legStatusLabel } from "../../lib/bookingWorkflow";

type DeliveryStatus =
  | "unassigned"
  | "assigned"
  | "en_route_to_pickup"
  | "picked_up"
  | "en_route_to_workshop"
  | "at_workshop"
  | "en_route_to_dropoff"
  | "delivered"
  | "cancelled";

interface Delivery {
  _id: string;
  leg: "pickup" | "return";
  status: DeliveryStatus;
  // Populated refs: null once the referenced document is gone, so a stale
  // delivery can't take the whole dashboard down with it.
  booking: {
    _id: string;
    serviceType: string;
    pickupLocation?: { lat: number; lng: number; address: string };
    vehicle: { plateNumber: string; make: string; model: string } | null;
    // One combined round-trip fee, shared by both legs (paid once, to
    // whichever single staff member does the whole round trip).
    deliveryFee?: number | null;
    distanceKm?: number | null;
  } | null;
  workshop: { name: string; location: { lat: number; lng: number }; address: string } | null;
  customerLocation?: { lat: number; lng: number; address: string };
  // Set on THIS leg once the booking's combined fee has actually been paid
  // out — only one leg will ever have this set, since there's only one
  // payout for the whole booking.
  feeSettledAt?: string | null;
}

// Mirrors the server-side transition maps in deliveryController.js — used
// only to derive the single "next step" action button; the server is the
// real gate.
const PICKUP_LEG_NEXT: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string }>> = {
  assigned: { next: "en_route_to_pickup", label: "Go out for delivery" },
  en_route_to_pickup: { next: "picked_up", label: "Mark picked up" },
  picked_up: { next: "en_route_to_workshop", label: "Start heading to workshop" },
  en_route_to_workshop: { next: "at_workshop", label: "Mark dropped at workshop" },
};
const RETURN_LEG_NEXT: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string }>> = {
  assigned: { next: "en_route_to_dropoff", label: "Go out for delivery" },
  en_route_to_dropoff: { next: "delivered", label: "Mark delivered" },
};
// Kept in sync with the backend's EN_ROUTE_STATUSES (deliveryController.js,
// deliveryHandlers.js) — every status where location sharing/tracking is
// actually live, including "en_route_to_workshop" (picked_up -> at the shop).
const EN_ROUTE = ["en_route_to_pickup", "en_route_to_workshop", "en_route_to_dropoff"];


// iOS 13+ gates DeviceOrientationEvent behind an explicit permission prompt
// that can only be requested from a direct user gesture (a click handler) —
// it silently no-ops (or throws) if called any other way. Every other
// browser either has no such gate or exposes the event unprompted, so this
// is checked defensively rather than assumed.
type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function DeliveryCard({ delivery, onUpdated }: { delivery: Delivery; onUpdated: (d: Delivery) => void }) {
  const [updating, setUpdating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  // Latest compass reading, updated by the orientation listener and read by
  // the position callback — kept in a ref (not state) since it can fire many
  // times a second and shouldn't trigger a re-render on its own.
  const headingRef = useRef<number | null>(null);
  const orientationHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const nextMap = delivery.leg === "pickup" ? PICKUP_LEG_NEXT : RETURN_LEG_NEXT;
  const action = nextMap[delivery.status];

  const stopSharing = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (orientationHandlerRef.current) {
      window.removeEventListener("deviceorientationabsolute", orientationHandlerRef.current);
      window.removeEventListener("deviceorientation", orientationHandlerRef.current);
      orientationHandlerRef.current = null;
    }
    headingRef.current = null;
    setSharing(false);
  };

  /**
   * Location sharing follows the delivery's own status — there is no toggle.
   *
   * A driver who is en route is, by definition, delivering; asking them to
   * remember a button meant a customer watching the map saw nothing while the
   * vehicle was genuinely moving. It starts again on its own for the return
   * leg, which passes through en_route_to_dropoff just as the pickup passes
   * through en_route_to_pickup.
   *
   * The server accepts pushes for exactly these statuses (EN_ROUTE_STATUSES in
   * deliveryHandlers.js), so driving the client from the same rule keeps the
   * two in step.
   */
  useEffect(() => {
    if (EN_ROUTE.includes(delivery.status)) {
      if (!sharing) startSharing();
    } else if (sharing) {
      stopSharing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.status]);

  useEffect(() => stopSharing, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Best-effort: reads whichever compass field the browser actually provides
  // and normalizes it to "degrees clockwise from true north," matching what
  // the map's rotation expects. `webkitCompassHeading` (Safari/iOS) is
  // already in that convention; `alpha` (the standard field, Android/others)
  // increases counter-clockwise from the device's arbitrary start orientation,
  // so it's inverted. Absolute-orientation events are preferred when
  // available since they're anchored to true north rather than wherever the
  // device happened to be pointed when the listener attached.
  const startCompass = () => {
    const handler = (e: DeviceOrientationEvent) => {
      const webkitHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkitHeading === "number") {
        headingRef.current = webkitHeading;
      } else if (typeof e.alpha === "number") {
        headingRef.current = (360 - e.alpha) % 360;
      }
    };
    orientationHandlerRef.current = handler;
    const eventName = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(eventName as "deviceorientation", handler);
  };

  const startSharing = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }

    // Only iOS Safari requires this explicit tap-triggered prompt; every
    // other browser either has no permission gate on orientation events or
    // exposes them unprompted, so compass tracking is skipped silently
    // (never blocking location sharing itself) rather than erroring.
    const OrientationEventCtor = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined;
    if (typeof OrientationEventCtor?.requestPermission === "function") {
      try {
        const result = await OrientationEventCtor.requestPermission();
        if (result === "granted") startCompass();
      } catch {
        // Permission API present but the prompt failed/was dismissed —
        // location sharing still proceeds without a compass heading.
      }
    } else if (typeof DeviceOrientationEvent !== "undefined") {
      startCompass();
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        getSocket().emit("delivery:push", {
          deliveryId: delivery._id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed ?? undefined,
          heading: headingRef.current ?? undefined,
        });
      },
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setSharing(true);
  };

  const advance = async () => {
    if (!action) return;
    setUpdating(true);
    try {
      const res = await api.patch(`/deliveries/${delivery._id}/status`, { status: action.next });
      onUpdated(res.data.delivery);
      toast.success(legStatusLabel(delivery.leg, action.next));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update status"));
    } finally {
      setUpdating(false);
    }
  };

  const destination =
    delivery.leg === "pickup" && ["assigned", "en_route_to_pickup"].includes(delivery.status)
      ? { ...delivery.customerLocation, label: "Pickup point" }
      : { ...delivery.workshop?.location, label: delivery.workshop?.name ?? "Workshop" };

  return (
    <div className="uh-card" style={{ marginBottom: 16 }}>
      <div className="ap-row">
        <div className="ap-row-main">
          <span className="ap-row-title">
            {delivery.leg === "pickup" ? "Pickup" : "Return"} — {delivery.booking?.vehicle?.plateNumber ?? "Unknown vehicle"}
          </span>
          <span className="ap-row-sub">
            {delivery.booking?.serviceType ?? "Service"} · {delivery.workshop?.name ?? "Unknown workshop"}
            {delivery.customerLocation?.address ? ` · ${delivery.customerLocation.address}` : ""}
          </span>
          {delivery.booking?.deliveryFee != null && (
            <span className="ap-row-sub">
              {delivery.booking.distanceKm != null && `${delivery.booking.distanceKm.toFixed(1)} km · `}
              Round-trip delivery fee Rs {(delivery.booking.deliveryFee / 100).toFixed(2)} — you earn Rs {((delivery.booking.deliveryFee * 0.95) / 100).toFixed(2)}
              {delivery.feeSettledAt && <span className="uh-badge uh-badge-green" style={{ marginLeft: 6 }}>paid</span>}
            </span>
          )}
        </div>
        <span className="uh-badge uh-badge-blue">{legStatusLabel(delivery.leg, delivery.status)}</span>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {action && (
          <button className="uh-btn uh-btn-primary uh-btn-sm" onClick={advance} disabled={updating}>
            {updating ? "Updating..." : action.label}
          </button>
        )}
        {/* Status, not a control — sharing turns itself on and off with the
            delivery's own status. */}
        {EN_ROUTE.includes(delivery.status) && (
          <span className={`uh-badge ${sharing ? "uh-badge-green" : "uh-badge-slate"}`}>
            {sharing ? "Sharing your location" : "Starting location sharing…"}
          </span>
        )}
      </div>

      {EN_ROUTE.includes(delivery.status) && (
        <div style={{ marginTop: 12 }}>
          <LiveDeliveryMap
            deliveryId={delivery._id}
            fixedPoints={destination.lat != null && destination.lng != null ? [destination as { lat: number; lng: number; label: string }] : []}
            destination={destination.lat != null && destination.lng != null ? (destination as { lat: number; lng: number }) : undefined}
            status={delivery.status}
            height={260}
          />
        </div>
      )}
    </div>
  );
}

function DeliveryDashboardPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/deliveries/mine");
      setDeliveries(res.data.deliveries);
    } catch {
      toast.error("Failed to load your deliveries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const socket = getSocket();
    const upsert = (updated: Delivery) => {
      setDeliveries((prev) => {
        const exists = prev.some((d) => d._id === updated._id);
        return exists ? prev.map((d) => (d._id === updated._id ? { ...d, ...updated } : d)) : [updated, ...prev];
      });
    };
    socket.on("delivery:assigned", upsert);
    socket.on("delivery:status", upsert);
    return () => {
      socket.off("delivery:assigned", upsert);
      socket.off("delivery:status", upsert);
    };
  }, []);

  // Ambient "I'm online, here's roughly where I am" — independent of any
  // active delivery leg's fine-grained watchPosition tracking below. Keeps
  // this staff member visible on admin/delivery-admin's live-locations view
  // any time this dashboard tab is open, not just while en route.
  useEffect(() => {
    const socket = getSocket();
    const ping = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => socket.emit("staff:ping-location", { lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, // best-effort — not user-facing
        { maximumAge: 60000, timeout: 10000 }
      );
    };
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, []);

  const active = deliveries.filter((d) => d.status !== "delivered" && d.status !== "cancelled" && d.status !== "at_workshop");
  const done = deliveries.filter((d) => d.status === "delivered" || d.status === "cancelled" || d.status === "at_workshop");

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>My Deliveries</h1>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : deliveries.length === 0 ? (
        <div className="uh-empty">No deliveries assigned yet.</div>
      ) : (
        <>
          {active.map((d) => (
            <DeliveryCard
              key={d._id}
              delivery={d}
              onUpdated={(updated) => setDeliveries((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))}
            />
          ))}
          {done.length > 0 && (
            <>
              <div className="ap-section-title" style={{ marginTop: 20 }}>Completed</div>
              {done.map((d) => (
                <DeliveryCard
                  key={d._id}
                  delivery={d}
                  onUpdated={(updated) => setDeliveries((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default DeliveryDashboardPage;
