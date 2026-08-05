import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import api from "../lib/api";
import { getSocket } from "../lib/socket";

// Same Vite marker-icon fix as LiveDeliveryMap.tsx — safe to run twice, it's
// a one-time global side effect on Leaflet's default icon config.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

interface StaffLocation {
  staffId: string;
  firstname: string;
  lastname: string;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
}

interface StaffApiRow {
  _id: string;
  firstname: string;
  lastname: string;
  lastKnownLocation?: { lat: number | null; lng: number | null };
  lastSeenAt: string | null;
}

const isOnline = (lastSeenAt: string | null) =>
  !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 120000;

function AdminStaffLocationsPage() {
  const [staff, setStaff] = useState<StaffLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/delivery-staff")
      .then((res) => {
        setStaff(
          (res.data.staff as StaffApiRow[]).map((s) => ({
            staffId: s._id,
            firstname: s.firstname,
            lastname: s.lastname,
            lat: s.lastKnownLocation?.lat ?? null,
            lng: s.lastKnownLocation?.lng ?? null,
            lastSeenAt: s.lastSeenAt,
          }))
        );
      })
      .catch(() => toast.error("Failed to load staff"))
      .finally(() => setLoading(false));

    const socket = getSocket();
    socket.emit("staff:subscribe-locations", null, (ack: { success: boolean }) => {
      if (!ack?.success) console.warn("staff:subscribe-locations failed");
    });
    const onLocation = (p: { staffId: string; lat: number; lng: number; recordedAt: string }) => {
      setStaff((prev) => prev.map((s) => (s.staffId === p.staffId ? { ...s, lat: p.lat, lng: p.lng, lastSeenAt: p.recordedAt } : s)));
    };
    const onOffline = ({ staffId }: { staffId: string }) => {
      setStaff((prev) => prev.map((s) => (s.staffId === staffId ? { ...s, lastSeenAt: null } : s)));
    };
    socket.on("staff:location", onLocation);
    socket.on("staff:offline", onOffline);
    return () => {
      socket.off("staff:location", onLocation);
      socket.off("staff:offline", onOffline);
    };
  }, []);

  const online = staff.filter((s) => s.lat != null && s.lng != null && isOnline(s.lastSeenAt));

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Delivery Staff — Live Locations</h1>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : online.length === 0 ? (
        <div className="uh-empty">No delivery-staff currently online.</div>
      ) : (
        <div style={{ height: 480 }}>
          <MapContainer center={[online[0].lat!, online[0].lng!]} zoom={12} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {online.map((s) => (
              <Marker key={s.staffId} position={[s.lat!, s.lng!]}>
                <Popup>
                  {s.firstname} {s.lastname}
                  <br />
                  Last seen {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleTimeString() : "unknown"}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default AdminStaffLocationsPage;
