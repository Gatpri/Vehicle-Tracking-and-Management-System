import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import "./LiveDeliveryMap.css";
import api from "../lib/api";
import { getSocket, subscribeWithReconnect } from "../lib/socket";

// Vite/webpack break Leaflet's default marker icon URL resolution — the
// standard fix is to re-point it at the bundled asset URLs explicitly.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

/**
 * The rider's own marker: a Google-Maps style navigation arrow.
 *
 * Shown only to the staff member who is driving. The whole arrow rotates
 * through the full 360° with their phone's compass, so "up" on screen is
 * always the direction they are physically facing — turn the handlebars and
 * the arrowhead turns with them. That is the one thing a person navigating
 * needs and a person watching does not.
 */
const navigationArrowIcon = (bearingDeg: number) =>
  L.divIcon({
    className: "ldm-nav-arrow",
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `
      <div style="width:48px;height:48px;transform:rotate(${bearingDeg}deg);transform-origin:50% 50%;">
        <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <!-- Soft halo: the GPS-accuracy disc every navigation app draws. -->
          <circle cx="24" cy="24" r="22" fill="#fff" fill-opacity="0.92"/>
          <circle cx="24" cy="24" r="22" fill="#4285f4" fill-opacity="0.10"/>
          <!-- The arrowhead itself, notched at the base so the direction reads
               unambiguously even at small sizes. -->
          <path d="M24 8 L34 34 L24 28 L14 34 Z"
                fill="#1a73e8" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
  });

/**
 * What each vehicle type looks like on the map, as a 24x24 stroked glyph.
 *
 * Observers are watching THEIR OWN VEHICLE being moved, so the marker shows
 * the vehicle rather than the rider: a customer whose car is at the workshop
 * should see a car. Falls back to the car glyph for "other" and for anything
 * unrecognised, since it reads as "a vehicle" more neutrally than a bike does.
 */
const VEHICLE_GLYPH: Record<string, string> = {
  bike: `<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
         <path d="M15 17.5h-4l-2-6 3-2.5"/><path d="M9 6h3"/><path d="M12 9l3 4h3.5"/>`,
  scooter: `<circle cx="6" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M18.5 17.5h-9l1-8h2.5"/><path d="M12.5 9.5h4l2 8"/>`,
  car: `<path d="M5 17v2M19 17v2"/>
        <path d="M3 14l1.5-5A2 2 0 0 1 6.4 7.5h11.2A2 2 0 0 1 19.5 9L21 14v3H3z"/>
        <path d="M4.5 9.5h15"/><circle cx="7" cy="14.5" r="1"/><circle cx="17" cy="14.5" r="1"/>`,
  truck: `<path d="M2 16V7h11v9"/><path d="M13 10h4l3 3v3h-7"/>
          <circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>`,
};

/**
 * The moving vehicle, as everyone except the rider sees it.
 *
 * The glyph is kept UPRIGHT while only the surrounding arrow rotates: a
 * rotated car or bike reads as "crashed" at most angles, and the direction of
 * travel is carried perfectly well by the arrow alone. This is the opposite
 * choice from the rider's marker above, and deliberately so — an observer is
 * reading a map north-up, not steering.
 */
const vehicleIcon = (bearingDeg: number | null, vehicleType?: string | null) => {
  const glyph = VEHICLE_GLYPH[vehicleType ?? "car"] ?? VEHICLE_GLYPH.car;
  return L.divIcon({
    className: "ldm-vehicle-marker",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `
      <div style="position:relative;width:40px;height:40px;">
        ${
          bearingDeg == null
            ? ""
            : `<div style="position:absolute;inset:0;transform:rotate(${bearingDeg}deg);">
                 <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                   <path d="M20 1 L25 10 L20 7.5 L15 10 Z" fill="#2563eb" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
                 </svg>
               </div>`
        }
        <div style="position:absolute;left:6px;top:6px;width:28px;height:28px;border-radius:50%;
                    background:#2563eb;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
                    display:flex;align-items:center;justify-content:center;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
        </div>
      </div>
    `,
  });
};

/**
 * What the rider is doing right now, in the words a customer would use.
 *
 * The status alone ("en_route_to_workshop") is meaningless to a customer, and
 * the same status means different things on the two legs — heading to the
 * workshop is a *collection* on the pickup leg and a *return* on the delivery
 * leg — so the leg has to be part of the decision.
 */
const LEG_LABEL: Record<string, string> = {
  en_route_to_pickup: "Rider heading to your location",
  en_route_to_workshop: "Taking your vehicle to the workshop",
  en_route_to_dropoff: "Returning your vehicle to you",
  picked_up: "Vehicle collected",
  at_workshop: "Vehicle at the workshop",
  delivered: "Vehicle delivered",
  assigned: "Rider assigned",
};

/**
 * The same states from the driver's seat.
 *
 * The customer wording above is second-person about *their* vehicle ("your
 * vehicle", "to you"), which is actively confusing to the rider reading their
 * own screen — they are not the one receiving it. These are instructions
 * instead: where to go next.
 */
const RIDER_LEG_LABEL: Record<string, string> = {
  en_route_to_pickup: "Go to the customer",
  en_route_to_workshop: "Deliver to the workshop",
  en_route_to_dropoff: "Return to the customer",
  picked_up: "Vehicle collected",
  at_workshop: "Dropped at workshop",
  delivered: "Delivered",
  assigned: "Assigned — not started",
};

/** "3 min", "1 hr 5 min" — the ETA as a driver reads it, never raw seconds. */
const formatEta = (seconds: number) => {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

/** Metric, because the fleet is in Nepal — metres under 1 km, else 1 dp of km. */
const formatDistance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;

/** Arrival clock time, so a customer can plan around it rather than watch a
 *  countdown. Matches the "8:54 AM" line in a phone navigation view. */
const formatArrival = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// No device compass involved (browser geolocation's `heading` field is null
// or unreliable at low speed/when stationary) — instead the bearing is
// derived purely from the last two GPS fixes, the same way every consumer
// map app effectively does when a device lacks a magnetometer.
const bearingBetween = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

interface LocationPoint {
  lat: number;
  lng: number;
  recordedAt: string;
  speed?: number | null;
  // Device compass reading in degrees from true north, when the staff's
  // browser supports and was granted DeviceOrientationEvent — reflects which
  // way the phone is physically facing right now, even while stationary.
  // Preferred over the travel-direction estimate below when present.
  heading?: number | null;
}

interface FixedPoint {
  lat: number;
  lng: number;
  label: string;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

// Rough distance in km between two points — good enough to decide "has the
// staff moved far enough to bother re-fetching a route," not for billing.
const roughDistanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = a.lat - b.lat;
  const dLng = a.lng - b.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111; // ~111km per degree
};

interface LiveDeliveryMapProps {
  deliveryId: string;
  /** Fixed reference points to render alongside the moving staff marker — the
   * customer's pickup/dropoff point and the workshop's location. */
  fixedPoints?: FixedPoint[];
  /** Where the staff is currently heading — drives the road-following route
   * line. Distinct from fixedPoints since a route needs exactly one target,
   * while fixedPoints may show several reference markers at once. */
  destination?: { lat: number; lng: number };
  height?: number | string;
  /** The delivery leg's current status, used only to phrase the "no live
   * point yet" fallback appropriately (assigned vs. stopped vs. never sent). */
  status?: string;
  /**
   * Who is looking at this map. The two audiences want opposite things, so
   * this is not a cosmetic switch:
   *
   *   "rider"    — the staff member navigating. They are the blue arrow, and
   *                the arrow turns with their phone's compass so "up" always
   *                means "the way you are facing". The footer answers "how far
   *                to my next stop".
   *   "observer" — a customer, workshop-admin, delivery-admin, admin or
   *                superadmin watching someone else move. They see a bike, so
   *                it is obvious at a glance that the marker is a rider and
   *                not a pin, and the footer answers "when does it arrive".
   *
   * Defaults to "observer": the watching roles outnumber the rider, and
   * showing an observer a navigation arrow implies they are the one driving.
   */
  viewer?: "rider" | "observer";
  /**
   * The type of vehicle being delivered ("car", "bike", "scooter", "truck",
   * "other" — Vehicle.vehicleType). Observers are watching their own vehicle
   * being moved, so the marker matches it: a customer whose car is in for
   * service sees a car, not a bike. Ignored when `viewer` is "rider", who
   * always gets the navigation arrow. Defaults to the car glyph.
   */
  vehicleType?: string | null;
}

function LiveDeliveryMap({
  deliveryId,
  fixedPoints = [],
  destination,
  height = 320,
  status,
  viewer = "observer",
  vehicleType,
}: LiveDeliveryMapProps) {
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [latest, setLatest] = useState<LocationPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  // Travel time and distance for the route above, from the same OSRM response.
  const [eta, setEta] = useState<{ seconds: number; metres: number } | null>(null);
  const lastRoutedFrom = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [histRes, latestRes] = await Promise.all([
          api.get(`/deliveries/${deliveryId}/history`),
          api.get(`/deliveries/${deliveryId}/latest`),
        ]);
        if (cancelled) return;
        setHistory([...histRes.data.history].reverse());
        setLatest(latestRes.data.latest);
      } catch {
        // A viewer without any points yet (leg not started) isn't an error.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    const socket = getSocket();
    // Re-subscribes on every reconnect: room membership is per-connection
    // server-side, so a plain one-shot emit stops delivering updates after the
    // first network blip (or after the staff's leg starts later in the session).
    const unsubscribe = subscribeWithReconnect("delivery:subscribe", deliveryId, (message) =>
      console.warn("delivery:subscribe failed:", message)
    );
    const onUpdate = (point: LocationPoint) => {
      setLatest(point);
      setHistory((prev) => [...prev, point]);
    };
    socket.on("delivery:update", onUpdate);
    return () => {
      cancelled = true;
      unsubscribe();
      socket.off("delivery:update", onUpdate);
    };
  }, [deliveryId]);

  // Road-following route from the staff's current position to their
  // destination, via OSRM's free public routing server (no API key, no new
  // dependency). Re-fetched only when the staff has moved meaningfully since
  // the last fetch — not on every single GPS tick, which would hammer a
  // shared public instance for a road path that barely changes over a few
  // metres.
  useEffect(() => {
    if (!latest || !destination) return;
    const movedEnough =
      !lastRoutedFrom.current || roughDistanceKm(lastRoutedFrom.current, latest) > 0.2;
    if (!movedEnough) return;

    let cancelled = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${latest.lng},${latest.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const route = data.routes?.[0];
        const coords: [number, number][] | undefined = route?.geometry?.coordinates;
        if (coords) {
          setRouteCoords(coords.map(([lng, lat]) => [lat, lng]));
          lastRoutedFrom.current = latest;
          // OSRM already returns these alongside the geometry; they were being
          // discarded. Surfacing them is what turns a route line into an
          // actual navigation view — "3 min · 0.9 mi", as any driver expects.
          setEta(
            typeof route.duration === "number" && typeof route.distance === "number"
              ? { seconds: route.duration, metres: route.distance }
              : null
          );
        }
      })
      .catch(() => {}); // route line is a nice-to-have; keep showing the plain pins if OSRM is unreachable
    return () => {
      cancelled = true;
    };
  }, [latest, destination]);

  if (loading) return <p>Loading map...</p>;

  const firstFixed = fixedPoints[0];
  const center: [number, number] = latest
    ? [latest.lat, latest.lng]
    : firstFixed
    ? [firstFixed.lat, firstFixed.lng]
    : [27.7172, 85.324];
  const polyline: [number, number][] = history.map((p) => [p.lat, p.lng]);

  // Prefers the device's own compass reading when the staff's browser
  // reported one — it reflects which way the phone is physically facing
  // right now, so it updates even while the staff is standing still turning
  // to look around, which a travel-direction estimate never can. Falls back
  // to the previous-fix -> latest-fix bearing (direction of travel), then to
  // a straight line toward the destination with only one point so far, and
  // finally to the plain non-rotating pin when none of those are available.
  const previousPoint = history.length >= 2 ? history[history.length - 2] : null;
  const bearing = latest
    ? typeof latest.heading === "number"
      ? latest.heading
      : previousPoint && roughDistanceKm(previousPoint, latest) > 0.005 // ignore GPS jitter under ~5m
      ? bearingBetween(previousPoint, latest)
      : destination
      ? bearingBetween(latest, destination)
      : null
    : null;

  return (
    <div style={{ height, width: "100%" }}>
      <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {fixedPoints.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} title={p.label} />
        ))}
        {latest && (
          <Marker
            position={[latest.lat, latest.lng]}
            // The rider steers, so their whole arrow turns with the compass;
            // everyone else reads a north-up map, so they get an upright
            // vehicle glyph with only the small arrow indicating travel.
            icon={
              viewer === "rider"
                ? navigationArrowIcon(bearing ?? 0)
                : vehicleIcon(bearing, vehicleType)
            }
            title={viewer === "rider" ? "You" : "Your vehicle"}
          />
        )}
        {latest && <RecenterMap lat={latest.lat} lng={latest.lng} />}
        {/* Where the rider has already been. Muted and semi-transparent so it
            reads as history: the bright blue is reserved for the road ahead,
            which is the part anyone watching actually cares about. */}
        {polyline.length > 1 && (
          <Polyline positions={polyline} pathOptions={{ color: "#94a3b8", weight: 4, opacity: 0.65 }} />
        )}
        {/* The road ahead. Drawn as a solid blue route in two passes — a wider
            darker casing under a lighter core — which is how every navigation
            app keeps a route legible over both pale roads and dark parkland.
            It was previously a thin dashed grey line that read as an
            afterthought rather than as the route being followed. */}
        {routeCoords.length > 1 && (
          <>
            <Polyline
              positions={routeCoords}
              pathOptions={{ color: "#1e40af", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
            />
            <Polyline
              positions={routeCoords}
              pathOptions={{ color: "#4285f4", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }}
            />
          </>
        )}
      </MapContainer>
      {/* The navigation bar. Replaces a line of raw latitude/longitude, which
          told a customer nothing they could act on. ETA and distance lead,
          because those are the only two numbers anyone actually wants. */}
      {latest ? (
        <div className="ldm-navbar">
          <div className="ldm-nav-primary">
            {eta ? (
              <>
                <span className="ldm-eta">{formatEta(eta.seconds)}</span>
                <span className="ldm-nav-sub">
                  {formatDistance(eta.metres)} ·{" "}
                  {viewer === "rider" ? "you arrive" : "arrives"} {formatArrival(eta.seconds)}
                </span>
              </>
            ) : (
              <>
                <span className="ldm-eta-pending">Live</span>
                <span className="ldm-nav-sub">Calculating route…</span>
              </>
            )}
          </div>
          <div className="ldm-nav-leg">
            {(() => {
              const labels = viewer === "rider" ? RIDER_LEG_LABEL : LEG_LABEL;
              return status ? labels[status] ?? "In progress" : "In progress";
            })()}
            {/* The rider knows their own position is current — it is their own
                phone. An observer does not, and when a marker looks wrong the
                honest question is always "how old is this fix?" */}
            {viewer === "observer" && (
              <span className="ldm-nav-seen">
                Updated {new Date(latest.recordedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="ldm-nav-idle">
          {viewer === "rider"
            ? status === "assigned"
              ? "Start the leg and your position appears here."
              : "Waiting for a GPS fix — allow location access if prompted."
            : status === "assigned"
            ? "Rider assigned — the map goes live as soon as they set off."
            : status === "picked_up" || status === "at_workshop"
            ? "Vehicle is at a stop — no live tracking needed right now."
            : "No live location yet."}
        </p>
      )}
    </div>
  );
}

export default LiveDeliveryMap;
