import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import api from "../lib/api";
import { getSocket, subscribeWithReconnect } from "../lib/socket";

// Vite/webpack break Leaflet's default marker icon URL resolution — the
// standard fix is to re-point it at the bundled asset URLs explicitly.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

// Used only while no heading is known yet (the very first point of a leg) —
// once two points exist, the rotating arrow below takes over.
const staffIcon = new L.Icon({
  iconUrl: icon,
  iconRetinaUrl: icon2x,
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: "ldm-staff-marker",
});

// A Google Maps / Uber style "you are here, facing this way" indicator: a
// solid arrow inside a soft halo, rotated via CSS to the computed heading.
// Built as an inline-SVG divIcon rather than a static image so the rotation
// can be applied per-render without swapping image assets.
const headingArrowIcon = (bearingDeg: number) =>
  L.divIcon({
    className: "ldm-heading-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div style="transform: rotate(${bearingDeg}deg); width: 34px; height: 34px;">
        <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
          <circle cx="17" cy="17" r="16" fill="#2563eb" fill-opacity="0.18" />
          <path d="M17 4 L26 24 L17 19 L8 24 Z" fill="#2563eb" stroke="white" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </div>
    `,
  });

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
}

function LiveDeliveryMap({ deliveryId, fixedPoints = [], destination, height = 320, status }: LiveDeliveryMapProps) {
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [latest, setLatest] = useState<LocationPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
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
        const coords: [number, number][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (coords) {
          setRouteCoords(coords.map(([lng, lat]) => [lat, lng]));
          lastRoutedFrom.current = latest;
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
            icon={bearing != null ? headingArrowIcon(bearing) : staffIcon}
            title="Delivery staff"
          />
        )}
        {latest && <RecenterMap lat={latest.lat} lng={latest.lng} />}
        {/* Solid blue: breadcrumb trail of where the staff has actually been. */}
        {polyline.length > 1 && <Polyline positions={polyline} pathOptions={{ color: "#2563eb" }} />}
        {/* Dashed grey: the suggested road route from here to the destination. */}
        {routeCoords.length > 1 && (
          <Polyline positions={routeCoords} pathOptions={{ color: "#6b7280", dashArray: "6 8", weight: 3 }} />
        )}
      </MapContainer>
      {latest ? (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          Last seen {new Date(latest.recordedAt).toLocaleTimeString()} at {latest.lat.toFixed(5)}, {latest.lng.toFixed(5)}
        </p>
      ) : (
        <p style={{ marginTop: 8, fontSize: 12 }}>
          {status === "assigned"
            ? "Staff member assigned — location will appear once they're on the way."
            : status === "picked_up" || status === "at_workshop"
            ? "Vehicle is at a stop — no live tracking needed right now."
            : "No live location yet."}
        </p>
      )}
    </div>
  );
}

export default LiveDeliveryMap;
