import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import api, { getErrorMessage } from "../lib/api";
import { getSocket, subscribeWithReconnect } from "../lib/socket";

// Vite/webpack break Leaflet's default marker icon URL resolution — the
// standard fix is to re-point it at the bundled asset URLs explicitly.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

interface LocationPoint {
  lat: number;
  lng: number;
  recordedAt: string;
  speed?: number | null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

function TrackingPage() {
  const { vehicleId } = useParams();
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [latest, setLatest] = useState<LocationPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [histRes, latestRes] = await Promise.all([
          api.get(`/tracking/${vehicleId}/history`),
          api.get(`/tracking/${vehicleId}/latest`),
        ]);
        setHistory([...histRes.data.history].reverse());
        setLatest(latestRes.data.latest);
      } catch {
        toast.error("Failed to load tracking data");
      } finally {
        setLoading(false);
      }
    };
    load();

    const socket = getSocket();
    // Re-subscribes on reconnect — server-side rooms are per-connection, so a
    // one-shot emit goes silent after any network drop.
    const unsubscribe = subscribeWithReconnect("tracking:subscribe", vehicleId, (message) =>
      console.warn("tracking:subscribe failed:", message)
    );
    const onUpdate = (point: LocationPoint) => {
      setLatest(point);
      setHistory((prev) => [...prev, point]);
    };
    socket.on("tracking:update", onUpdate);
    return () => {
      unsubscribe();
      socket.off("tracking:update", onUpdate);
    };
  }, [vehicleId]);

  const recordLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setRecording(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.post(`/tracking/${vehicleId}/location`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            speed: pos.coords.speed ?? undefined,
          });
          toast.success("Location recorded");
        } catch (err) {
          toast.error(getErrorMessage(err, "Failed to record location"));
        } finally {
          setRecording(false);
        }
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setRecording(false);
      }
    );
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  const center: [number, number] = latest ? [latest.lat, latest.lng] : [27.7172, 85.324];
  const polyline: [number, number][] = history.map((p) => [p.lat, p.lng]);

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Live Tracking</h1>
        <button className="uh-btn uh-btn-primary" onClick={recordLocation} disabled={recording}>
          {recording ? "Recording..." : "Record My Location"}
        </button>
      </div>

      <div className="ap-map-wrap">
        <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {latest && <Marker position={[latest.lat, latest.lng]} />}
          {latest && <RecenterMap lat={latest.lat} lng={latest.lng} />}
          {polyline.length > 1 && <Polyline positions={polyline} pathOptions={{ color: "#2563eb" }} />}
        </MapContainer>
      </div>

      {latest ? (
        <p style={{ marginTop: 14, fontSize: 13 }}>
          Last seen {new Date(latest.recordedAt).toLocaleString()} at {latest.lat.toFixed(5)}, {latest.lng.toFixed(5)}
        </p>
      ) : (
        <p style={{ marginTop: 14, fontSize: 13 }}>No location recorded yet — use "Record My Location" to start.</p>
      )}
    </div>
  );
}

export default TrackingPage;
