import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface Booking {
  _id: string;
  user: { firstname: string; lastname: string; email: string };
  vehicle: { plateNumber: string; make: string; model: string };
  workshop: { name: string };
  serviceType: string;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled";
  quotedPrice: number | null;
  isOverpriced: boolean;
}

function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get("/bookings");
      setBookings(res.data.bookings);
    } catch {
      toast.error("Failed to load bookings");
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
    const onOverpriced = (b: Booking) => {
      toast.warn(`Overpriced quote flagged for ${b.serviceType}`);
    };
    socket.on("booking:overpriced", onOverpriced);
    return () => {
      socket.off("booking:overpriced", onOverpriced);
    };
  }, []);

  const accept = async (id: string) => {
    const quotedPrice = Number(quotes[id]);
    if (!quotedPrice || quotedPrice <= 0) {
      toast.error("Enter a quote amount (in paisa) first");
      return;
    }
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/accept`, { quotedPrice });
      toast.success("Booking accepted");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to accept booking"));
    } finally {
      setBusyId(null);
    }
  };

  const start = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/start`);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start booking"));
    } finally {
      setBusyId(null);
    }
  };

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/complete`);
      toast.success("Booking completed");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to complete booking"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Bookings</h2></div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="adm-empty">No bookings.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Customer</th><th>Vehicle</th><th>Workshop</th><th>Service</th><th>Status</th><th>Quote</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b._id}>
                <td>{b.user?.firstname} {b.user?.lastname}</td>
                <td>{b.vehicle?.plateNumber}</td>
                <td>{b.workshop?.name}</td>
                <td>{b.serviceType}</td>
                <td><span className={`role-badge status-${b.status}`}>{b.status}</span></td>
                <td>
                  {b.quotedPrice != null ? `Rs ${(b.quotedPrice / 100).toFixed(2)}` : "—"}
                  {b.isOverpriced && <div className="adm-overprice-warning">⚠ overpriced</div>}
                </td>
                <td>
                  {b.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        placeholder="paisa"
                        style={{ width: 90 }}
                        value={quotes[b._id] || ""}
                        onChange={(e) => setQuotes((q) => ({ ...q, [b._id]: e.target.value }))}
                      />
                      <button className="add-btn" disabled={busyId === b._id} onClick={() => accept(b._id)}>Accept</button>
                    </div>
                  )}
                  {b.status === "accepted" && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => start(b._id)}>Start</button>
                  )}
                  {b.status === "in_progress" && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => complete(b._id)}>Complete</button>
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

export default AdminBookingsPage;
