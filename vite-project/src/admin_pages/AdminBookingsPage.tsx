import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import PartsQuotePanel from "../components/PartsQuotePanel";
import { BOOKING_STATUS, statusLabel, canSeePartsEstimate } from "../lib/bookingWorkflow";
import "./AdminPages.css";

interface Booking {
  _id: string;
  user: { firstname: string; lastname: string; email: string };
  vehicle: { plateNumber: string; make: string; model: string };
  workshop: { name: string };
  serviceType: string;
  status: string;
  deliveryRequested?: boolean;
  finalPrice: number | null;
  isOverpriced: boolean;
  paymentStatus: "unpaid" | "paid" | "refunded";
}

function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Opened from the row, or deep-linked from a notification (?quote=<id>).
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("quote")
  );

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
    const onOverpriced = ({ agreedTotal }: { bookingId: string; agreedTotal: number }) => {
      toast.warn(`Overpriced quote flagged — agreed total Rs ${(agreedTotal / 100).toFixed(2)}`);
      load();
    };
    socket.on("booking:overpriced", onOverpriced);
    return () => {
      socket.off("booking:overpriced", onOverpriced);
    };
  }, []);

  const accept = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/accept`);
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

  // Signs the paid job off. The booking still closes itself ("Finished") a
  // minute later — this step confirms the work is done, which is also what
  // releases a delivery booking's vehicle for its return leg.
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

  const requestPayment = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/request-payment`);
      toast.success("Payment requested from the customer");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to request payment"));
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
            {bookings.map((b) => [
              <tr key={b._id}>
                <td>{b.user?.firstname} {b.user?.lastname}</td>
                <td>{b.vehicle?.plateNumber}</td>
                <td>{b.workshop?.name}</td>
                <td>{b.serviceType}</td>
                <td><span className={`role-badge status-${b.status}`}>{statusLabel(b.status)}</span></td>
                <td>
                  {b.finalPrice != null ? `Rs ${(b.finalPrice / 100).toFixed(2)}` : "—"}
                  {b.isOverpriced && <div className="adm-overprice-warning">⚠ overpriced</div>}
                </td>
                <td>
                  {b.status === BOOKING_STATUS.PENDING && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => accept(b._id)}>Accept</button>
                  )}
                  {/* Step 7: only once the vehicle is actually at the workshop.
                      A delivery booking has to reach "dropped" first; a
                      self-drop-off booking can start straight from accepted. */}
                  {(b.status === BOOKING_STATUS.DROPPED ||
                    (b.status === BOOKING_STATUS.ACCEPTED && !b.deliveryRequested)) && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => start(b._id)}>Start service</button>
                  )}
                  {/* Step 9: the agreed estimate is closed out and the bill goes
                      to the customer. */}
                  {b.status === BOOKING_STATUS.ESTIMATION_CONFIRMED && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => requestPayment(b._id)}>
                      Request payment
                    </button>
                  )}
                  {/* Waiting on someone else — spelled out so the workshop knows
                      why there's no button rather than assuming it's broken. */}
                  {b.status === BOOKING_STATUS.DELIVERY_REQUESTED && (
                    <span className="adm-muted">Awaiting delivery assignment</span>
                  )}
                  {b.status === BOOKING_STATUS.ESTIMATION_PENDING && (
                    <span className="adm-muted">Awaiting customer's estimate reply</span>
                  )}
                  {b.status === BOOKING_STATUS.PAYMENT_PENDING && (
                    <span className="adm-muted">Awaiting payment</span>
                  )}
                  {/* Paid, so the workshop signs the job off. For a delivery
                      booking this is what releases the vehicle for its return
                      leg — the delivery admin can't assign one before it. */}
                  {b.status === BOOKING_STATUS.PAYMENT_COMPLETED && (
                    <button className="add-btn" disabled={busyId === b._id} onClick={() => complete(b._id)}>
                      Complete
                    </button>
                  )}
                  {b.status === BOOKING_STATUS.COMPLETED && b.deliveryRequested && (
                    <span className="adm-muted">Awaiting return delivery assignment</span>
                  )}
                  {/* Parts are found once the bike is open, so this appears
                      only after "Start service" (step 7) — never while the
                      vehicle is still in transit. Past estimates stay readable
                      afterwards, but the panel closes for edits once paid,
                      when changing the total would contradict money collected. */}
                  {canSeePartsEstimate(b) && b.paymentStatus !== "paid" && (
                    <button
                      className="adm-camera-toggle"
                      style={{ marginTop: 6 }}
                      onClick={() => setOpenQuoteId(openQuoteId === b._id ? null : b._id)}
                    >
                      {openQuoteId === b._id ? "Hide estimate" : "Parts estimate"}
                    </button>
                  )}
                </td>
              </tr>,
              openQuoteId === b._id && (
                <tr key={`${b._id}-quote`}>
                  <td colSpan={7} style={{ background: "#0e0f19", padding: 14 }}>
                    <PartsQuotePanel bookingId={b._id} side="workshop" />
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

export default AdminBookingsPage;
