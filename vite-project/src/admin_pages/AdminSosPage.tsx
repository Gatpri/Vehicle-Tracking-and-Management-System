import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface SosAlert {
  _id: string;
  user: { firstname: string; lastname: string; email: string };
  location: { lat: number; lng: number };
  message: string;
  status: "active" | "resolved";
  createdAt: string;
}

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
      toast.error(`New SOS alert from ${alert.user?.firstname ?? "a user"}!`);
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
          <thead><tr><th>User</th><th>Message</th><th>Location</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a._id}>
                <td>{a.user?.firstname} {a.user?.lastname}</td>
                <td>{a.message || "—"}</td>
                <td>{a.location.lat.toFixed(4)}, {a.location.lng.toFixed(4)}</td>
                <td><span className={`role-badge status-${a.status}`}>{a.status}</span></td>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>
                  {a.status === "active" && (
                    <button className="add-btn" disabled={resolvingId === a._id} onClick={() => resolve(a._id)}>Resolve</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminSosPage;
