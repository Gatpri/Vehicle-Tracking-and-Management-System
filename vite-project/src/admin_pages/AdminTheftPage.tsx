import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface TheftReport {
  _id: string;
  vehicle: { plateNumber: string; make: string; model: string };
  reportedBy: { firstname: string; lastname: string };
  description: string;
  status: "open" | "recovered" | "closed";
  createdAt: string;
}

function AdminTheftPage() {
  const [reports, setReports] = useState<TheftReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get("/theft-reports");
      setReports(res.data.reports);
    } catch {
      toast.error("Failed to load theft reports");
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
    const onNew = (report: TheftReport) => {
      setReports((prev) => [report, ...prev]);
      toast.warn("New theft report filed");
    };
    socket.on("theft:new", onNew);
    return () => {
      socket.off("theft:new", onNew);
    };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      await api.patch(`/theft-reports/${id}`, { status });
      toast.success(`Marked ${status}`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update report"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Theft Reports</h2></div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : reports.length === 0 ? (
        <p className="adm-empty">No theft reports.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Vehicle</th><th>Reported By</th><th>Description</th><th>Status</th><th>Time</th><th>Action</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r._id}>
                <td>{r.vehicle?.plateNumber}</td>
                <td>{r.reportedBy?.firstname} {r.reportedBy?.lastname}</td>
                <td>{r.description || "—"}</td>
                <td><span className={`role-badge status-${r.status}`}>{r.status}</span></td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>
                  {r.status === "open" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="add-btn" disabled={busyId === r._id} onClick={() => updateStatus(r._id, "recovered")}>Recovered</button>
                      <button className="delete-btn" disabled={busyId === r._id} onClick={() => updateStatus(r._id, "closed")}>Close</button>
                    </div>
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

export default AdminTheftPage;
