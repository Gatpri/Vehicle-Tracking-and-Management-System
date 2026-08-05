import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface SosAlert {
  _id: string;
  user: { firstname: string; lastname: string; email: string };
  location: { lat: number; lng: number };
  message: string;
  status: "active" | "pending" | "resolved";
  createdAt: string;
  // Present only on "theft" alerts — raised when an owner answered a camera
  // sighting of their stolen vehicle from the breaking-alert overlay.
  kind: "manual" | "theft";
  ownerConfirmation?: "confirmed" | "not-confirmed" | null;
  vehicle?: { plateNumber: string; make: string; model: string; color?: string } | null;
  plateImageUrl?: string;
  vehicleImageUrl?: string;
  ownerPlateImageUrl?: string;
  cameraId?: string;
  sightingLocation?: { lat: number | null; lng: number | null };
}

const mapLink = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

function AdminSosPage() {
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get("/sos");
      setAlerts(res.data.alerts);
    } catch {
      toast.error("Failed to load SOS alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();

    const socket = getSocket();
    const onNew = (alert: SosAlert) => {
      setAlerts((prev) => [alert, ...prev]);
      toast.error(
        alert.kind === "theft"
          ? `CONFIRMED THEFT — ${alert.vehicle?.plateNumber ?? "vehicle"} reported by ${alert.user?.firstname ?? "owner"}`
          : `New SOS alert from ${alert.user?.firstname ?? "a user"}!`
      );
    };
    socket.on("sos:new", onNew);
    return () => {
      socket.off("sos:new", onNew);
    };
  }, []);

  const resolve = async (id: string) => {
    setResolvingId(id);
    try {
      await api.patch(`/sos/${id}/resolve`);
      toast.success("Alert resolved");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to resolve alert"));
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>SOS Queue</h2></div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : alerts.length === 0 ? (
        <p className="adm-empty">No SOS alerts.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>User</th><th>Type</th><th>Message</th><th>Reporter location</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
          <tbody>
            {alerts.map((a) => [
              <tr key={a._id} className={a.kind === "theft" ? "adm-sos-theft-row" : undefined}>
                <td>{a.user?.firstname} {a.user?.lastname}</td>
                <td>
                  {a.kind !== "theft" ? (
                    <span className="role-badge status-pending">manual</span>
                  ) : a.ownerConfirmation === "confirmed" ? (
                    <span className="role-badge status-cancelled">confirmed theft</span>
                  ) : (
                    <span className="role-badge status-pending">not confirmed</span>
                  )}
                </td>
                <td className={a.ownerConfirmation === "confirmed" ? "adm-sos-action-confirmed" : undefined}>
                  {a.message || "—"}
                </td>
                <td>
                  <a href={mapLink(a.location.lat, a.location.lng)} target="_blank" rel="noreferrer">
                    {a.location.lat.toFixed(4)}, {a.location.lng.toFixed(4)}
                  </a>
                </td>
                <td><span className={`role-badge status-${a.status}`}>{a.status}</span></td>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>
                  {a.kind === "theft" && a.ownerConfirmation === "confirmed" && a.vehicle && (
                    <Link className="add-btn" to="/admin/theft-reports" style={{ marginRight: 8 }}>Track vehicle</Link>
                  )}
                  {a.status !== "resolved" && (
                    <button className="add-btn" disabled={resolvingId === a._id} onClick={() => resolve(a._id)}>Resolve</button>
                  )}
                </td>
              </tr>,
              // Evidence the owner's confirmation carried across: what the
              // camera saw, where, and what the vehicle is meant to look like.
              a.kind === "theft" && (
                <tr key={`${a._id}-evidence`} className="adm-sos-evidence">
                  <td colSpan={7}>
                    <div className="adm-sos-evidence-inner">
                      {a.plateImageUrl && (
                        <figure>
                          <img src={a.plateImageUrl} alt="Camera frame" />
                          <figcaption>Camera frame{a.cameraId ? ` · ${a.cameraId}` : ""}</figcaption>
                        </figure>
                      )}
                      {a.ownerPlateImageUrl && (
                        <figure>
                          <img src={a.ownerPlateImageUrl} alt="Owner's plate photo" />
                          <figcaption>Owner's plate photo</figcaption>
                        </figure>
                      )}
                      {a.vehicleImageUrl && (
                        <figure>
                          <img src={a.vehicleImageUrl} alt="Registered vehicle" />
                          <figcaption>Registered photo</figcaption>
                        </figure>
                      )}
                      <dl>
                        <div><dt>Vehicle</dt><dd>{a.vehicle?.plateNumber ?? "—"}</dd></div>
                        <div>
                          <dt>Make / model</dt>
                          <dd>{[a.vehicle?.color, a.vehicle?.make, a.vehicle?.model].filter(Boolean).join(" ") || "—"}</dd>
                        </div>
                        <div>
                          <dt>Seen at</dt>
                          <dd>
                            {a.sightingLocation?.lat != null && a.sightingLocation?.lng != null ? (
                              <a href={mapLink(a.sightingLocation.lat, a.sightingLocation.lng)} target="_blank" rel="noreferrer">
                                {a.sightingLocation.lat.toFixed(5)}, {a.sightingLocation.lng.toFixed(5)}
                              </a>
                            ) : "camera has no location"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminSosPage;
