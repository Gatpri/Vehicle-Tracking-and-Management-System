import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface StaffRow {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  area: string;
  region: string;
  deliveryRating: { average: number; count: number };
  lastSeenAt: string | null;
}

const isOnline = (lastSeenAt: string | null) =>
  !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 120000;

function DeliveryStaffTablePage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/delivery-staff");
      setStaff(res.data.staff);
    } catch {
      toast.error("Failed to load delivery-staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Permanently delete this delivery-staff account? This cannot be undone.")) return;
    try {
      await api.delete(`/delivery-staff/${id}`);
      toast.success("Delivery-staff account deleted");
      setStaff((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="dash-body">
      <div className="section">
        <h2>Delivery Staff</h2>
        {loading ? (
          <p className="loading">Loading...</p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Area</th>
                <th>Region</th>
                <th>Rating</th>
                <th>Online</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#888" }}>No delivery-staff found</td></tr>
              )}
              {staff.map((s) => (
                <tr key={s._id}>
                  <td>{s.firstname} {s.lastname}</td>
                  <td>{s.email}</td>
                  <td>{s.area || "—"}</td>
                  <td>{s.region || "—"}</td>
                  <td>{s.deliveryRating.count > 0 ? `★ ${s.deliveryRating.average.toFixed(1)} (${s.deliveryRating.count})` : "No reviews yet"}</td>
                  <td>{isOnline(s.lastSeenAt) ? "🟢 Online" : "⚪ Offline"}</td>
                  <td><button className="delete-btn" onClick={() => handleDelete(s._id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DeliveryStaffTablePage;
