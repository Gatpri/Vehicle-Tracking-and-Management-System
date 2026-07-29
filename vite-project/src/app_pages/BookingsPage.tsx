import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";

interface Booking {
  _id: string;
  vehicle: { _id: string; plateNumber: string; make: string; model: string };
  workshop: { _id: string; name: string };
  serviceType: string;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled";
  quotedPrice: number | null;
  finalPrice: number | null;
  isOverpriced: boolean;
  paymentStatus: "unpaid" | "paid" | "refunded";
  createdAt: string;
}

const statusBadge = (status: Booking["status"]) => {
  switch (status) {
    case "completed": return "uh-badge uh-badge-green";
    case "cancelled": return "uh-badge uh-badge-red";
    case "pending": return "uh-badge uh-badge-slate";
    default: return "uh-badge uh-badge-blue";
  }
};

function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = async (status?: string) => {
    setLoading(true);
    try {
      const res = await api.get("/bookings/mine", { params: status ? { status } : {} });
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
    const onUpdate = (updated: Booking) => {
      setBookings((prev) => {
        const exists = prev.some((b) => b._id === updated._id);
        return exists ? prev.map((b) => (b._id === updated._id ? updated : b)) : prev;
      });
    };
    socket.on("booking:updated", onUpdate);
    return () => {
      socket.off("booking:updated", onUpdate);
    };
  }, []);

  const handleFilter = (status: string) => {
    setStatusFilter(status);
    load(status || undefined);
  };

  const handleCancel = async (id: string) => {
    try {
      await api.patch(`/bookings/${id}/cancel`);
      toast.success("Booking cancelled");
      load(statusFilter || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to cancel booking"));
    }
  };

  const handlePay = async (id: string) => {
    setPayingId(id);
    try {
      await api.post("/wallet/pay-booking", { bookingId: id });
      toast.success("Paid from wallet");
      load(statusFilter || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed"));
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>My Bookings</h1>
        <select value={statusFilter} onChange={(e) => handleFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--slate-200)" }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : bookings.length === 0 ? (
        <div className="uh-empty">No bookings yet — browse workshops to request one.</div>
      ) : (
        <div className="uh-list">
          {bookings.map((b) => (
            <div className="ap-row" key={b._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">{b.serviceType} — {b.workshop?.name}</span>
                <span className="ap-row-sub">
                  {b.vehicle?.plateNumber} · {new Date(b.createdAt).toLocaleDateString()}
                  {b.quotedPrice != null && ` · Rs ${(b.quotedPrice / 100).toFixed(2)}`}
                  {b.isOverpriced && " · ⚠ flagged as overpriced"}
                </span>
              </div>
              <div className="ap-row-actions">
                <span className={statusBadge(b.status)}>{b.status}</span>
                {b.status === "pending" && (
                  <button className="uh-btn uh-btn-sm uh-btn-ghost" onClick={() => handleCancel(b._id)}>Cancel</button>
                )}
                {b.status === "completed" && b.paymentStatus === "unpaid" && (
                  <button className="uh-btn uh-btn-sm uh-btn-orange" onClick={() => handlePay(b._id)} disabled={payingId === b._id}>
                    {payingId === b._id ? "Paying..." : "Pay Now"}
                  </button>
                )}
                {b.paymentStatus === "paid" && <span className="uh-badge uh-badge-green">paid</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BookingsPage;
