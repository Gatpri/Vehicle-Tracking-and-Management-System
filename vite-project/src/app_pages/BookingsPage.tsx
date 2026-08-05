import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import PartsQuotePanel from "../components/PartsQuotePanel";
import LiveDeliveryMap from "../components/LiveDeliveryMap";
import DeliveryStaffReviewForm from "../components/DeliveryStaffReviewForm";
import { redirectToEsewa } from "../lib/esewa";

// Kept in sync with the backend's EN_ROUTE_STATUSES (deliveryController.js,
// deliveryHandlers.js) — every status where a live map has something to show.
const EN_ROUTE_STATUSES = ["en_route_to_pickup", "en_route_to_workshop", "en_route_to_dropoff"];

interface DeliveryLeg {
  _id: string;
  leg: "pickup" | "return";
  status: string;
  staff: { _id: string; firstname: string; lastname: string } | null;
  customerLocation?: { lat: number; lng: number; address: string };
  workshop?: { name: string; location: { lat: number; lng: number } };
}

const EN_ROUTE_PICKUP_STATUSES = ["assigned", "en_route_to_pickup"];

const destinationFor = (d: DeliveryLeg): { lat: number; lng: number } | undefined => {
  if (d.leg === "pickup" && EN_ROUTE_PICKUP_STATUSES.includes(d.status)) {
    return d.customerLocation ? { lat: d.customerLocation.lat, lng: d.customerLocation.lng } : undefined;
  }
  return d.workshop?.location;
};

function DeliveryTrackingPanel({ bookingId }: { bookingId: string }) {
  const [deliveries, setDeliveries] = useState<DeliveryLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewableIds, setReviewableIds] = useState<Set<string>>(new Set());

  const loadReviewable = () => {
    api
      .get("/deliveries/reviewable", { params: { bookingId } })
      .then((res) => setReviewableIds(new Set((res.data.deliveries as { _id: string }[]).map((d) => d._id))))
      .catch(() => setReviewableIds(new Set()));
  };

  useEffect(() => {
    api
      .get(`/deliveries/booking/${bookingId}`)
      .then((res) => setDeliveries(res.data.deliveries))
      .catch(() => setDeliveries([]))
      .finally(() => setLoading(false));
    loadReviewable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (loading) return <p style={{ fontSize: 13 }}>Loading delivery status...</p>;
  if (deliveries.length === 0) return <p style={{ fontSize: 13 }}>No delivery has been assigned yet.</p>;

  return (
    <div>
      {deliveries.map((d) => (
        <div key={d._id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{d.leg === "pickup" ? "Pickup" : "Return"}</strong> — {d.status}
            {d.staff && ` · ${d.staff.firstname} ${d.staff.lastname}`}
          </p>
          {EN_ROUTE_STATUSES.includes(d.status) && (
            <LiveDeliveryMap deliveryId={d._id} status={d.status} destination={destinationFor(d)} height={260} />
          )}
          {d.staff && reviewableIds.has(d._id) && (
            <DeliveryStaffReviewForm
              deliveryId={d._id}
              staffName={`${d.staff.firstname} ${d.staff.lastname}`}
              onSubmitted={loadReviewable}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface Booking {
  _id: string;
  vehicle: { _id: string; plateNumber: string; make: string; model: string };
  workshop: { _id: string; name: string };
  serviceType: string;
  status: "pending" | "accepted" | "in_progress" | "completed" | "cancelled";
  finalPrice: number | null;
  // One combined round-trip delivery fee (covers pickup AND return, paid
  // once, to a single staff member who does both legs) — null if no
  // delivery was ever requested. Bundled into "amount due" alongside
  // finalPrice, paid together in one charge.
  deliveryFee: number | null;
  isOverpriced: boolean;
  paymentStatus: "unpaid" | "paid" | "refunded";
  createdAt: string;
  deliveryRequested: boolean;
  // Return delivery is a separate customer opt-in, requested only after the
  // main booking is completed+paid — free once requested, since deliveryFee
  // already covers the whole round trip.
  returnDeliveryRequested: boolean;
}

// Mirrors the backend's bookingAmount (walletController.js) — parts/labor
// plus the one combined round-trip delivery fee, paid together as one charge.
const bookingAmount = (b: Booking) => (b.finalPrice ?? 0) + (b.deliveryFee ?? 0);

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
  // Opened from the row, or deep-linked from a notification (?quote=<id>).
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("quote")
  );
  // Which booking's "how do you want to pay?" row is expanded.
  const [payChoiceId, setPayChoiceId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  // Which booking's delivery-tracking panel is expanded.
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [requestingReturnId, setRequestingReturnId] = useState<string | null>(null);

  // Balance is fetched so the choice can say whether the wallet actually
  // covers the bill, rather than letting the user pick it and be refused.
  const loadWallet = async () => {
    try {
      const res = await api.get("/wallet");
      setWalletBalance(res.data.wallet.balance);
    } catch {
      setWalletBalance(null);
    }
  };

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
      await loadWallet();
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

  const payFromWallet = async (id: string) => {
    setPayingId(id);
    try {
      await api.post("/wallet/pay-booking", { bookingId: id });
      toast.success("Paid from wallet");
      setPayChoiceId(null);
      loadWallet();
      load(statusFilter || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, "Payment failed"));
    } finally {
      setPayingId(null);
    }
  };

  // Charges the exact booking amount through eSewa. The money lands in the
  // wallet and the backend settles the booking from it in the same step, so
  // there's one ledger either way.
  const payWithEsewa = async (id: string) => {
    setPayingId(id);
    try {
      const res = await api.post("/wallet/pay-booking/esewa", { bookingId: id });
      redirectToEsewa(res.data.url, res.data.fields);
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't start the eSewa payment"));
      setPayingId(null);
    }
  };

  // Free once requested — deliveryFee already covers the whole round trip,
  // paid as part of the main booking payment. Nothing further to charge.
  const requestReturnDelivery = async (id: string) => {
    setRequestingReturnId(id);
    try {
      await api.patch(`/bookings/${id}/request-return-delivery`);
      toast.success("Return delivery requested — an admin will assign a staff member soon");
      load(statusFilter || undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to request return delivery"));
    } finally {
      setRequestingReturnId(null);
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
            <div key={b._id}>
              <div className="ap-row">
                <div className="ap-row-main">
                  <span className="ap-row-title">{b.serviceType} — {b.workshop?.name}</span>
                  <span className="ap-row-sub">
                    {b.vehicle?.plateNumber} · {new Date(b.createdAt).toLocaleDateString()}
                    {b.finalPrice != null && ` · Rs ${(bookingAmount(b) / 100).toFixed(2)}`}
                    {(b.deliveryFee ?? 0) > 0 && ` (incl. Rs ${(b.deliveryFee! / 100).toFixed(2)} delivery)`}
                    {b.isOverpriced && " · ⚠ flagged as overpriced"}
                  </span>
                </div>
                <div className="ap-row-actions">
                  <span className={statusBadge(b.status)}>{b.status}</span>
                  {/* A quote can arrive at any point once work is under way, so
                      the panel is opened per booking rather than shown always. */}
                  {b.status !== "cancelled" && (
                    <button
                      className="uh-btn uh-btn-sm uh-btn-ghost"
                      onClick={() => setOpenQuoteId(openQuoteId === b._id ? null : b._id)}
                    >
                      {openQuoteId === b._id ? "Hide estimate" : "Parts estimate"}
                    </button>
                  )}
                  {b.status === "pending" && (
                    <button className="uh-btn uh-btn-sm uh-btn-ghost" onClick={() => handleCancel(b._id)}>Cancel</button>
                  )}
                  {b.status === "completed" && b.paymentStatus === "unpaid" && (
                    <button
                      className="uh-btn uh-btn-sm uh-btn-orange"
                      onClick={() => setPayChoiceId(payChoiceId === b._id ? null : b._id)}
                      disabled={payingId === b._id}
                    >
                      {payingId === b._id ? "Paying..." : "Pay Now"}
                    </button>
                  )}
                  {b.paymentStatus === "paid" && <span className="uh-badge uh-badge-green">paid</span>}
                  {/* Only ever shown for a booking the customer actually
                      requested delivery for — self-pickup bookings have
                      nothing to track. */}
                  {(b.deliveryRequested || b.returnDeliveryRequested) &&
                    (b.status === "accepted" || b.status === "in_progress" || b.status === "completed") && (
                      <button
                        className="uh-btn uh-btn-sm uh-btn-ghost"
                        onClick={() => setOpenDeliveryId(openDeliveryId === b._id ? null : b._id)}
                      >
                        {openDeliveryId === b._id ? "Hide delivery" : "Track delivery"}
                      </button>
                    )}
                  {/* Return delivery is only offerable once the main booking is
                      settled — a separate opt-in, never automatic, and free:
                      deliveryFee already covers the whole round trip. */}
                  {b.status === "completed" && b.paymentStatus === "paid" && !b.returnDeliveryRequested && (
                    <button
                      className="uh-btn uh-btn-sm uh-btn-ghost"
                      onClick={() => requestReturnDelivery(b._id)}
                      disabled={requestingReturnId === b._id}
                    >
                      {requestingReturnId === b._id ? "Requesting..." : "Request return delivery"}
                    </button>
                  )}
                  {b.returnDeliveryRequested && <span className="uh-badge uh-badge-slate">return delivery requested</span>}
                </div>
              </div>

              {openDeliveryId === b._id && (
                <div style={{ margin: "10px 0 18px" }}>
                  <DeliveryTrackingPanel bookingId={b._id} />
                </div>
              )}

              {payChoiceId === b._id && b.paymentStatus === "unpaid" && (
                <div className="ap-pay-choice">
                  <span className="ap-pay-amount">
                    Amount due <strong>Rs {(bookingAmount(b) / 100).toFixed(2)}</strong>
                    {(b.deliveryFee ?? 0) > 0 && (
                      <span className="ap-row-sub" style={{ display: "block" }}>
                        Rs {((b.finalPrice ?? 0) / 100).toFixed(2)} parts/labor + Rs {((b.deliveryFee ?? 0) / 100).toFixed(2)} delivery
                      </span>
                    )}
                  </span>
                  <div className="ap-pay-options">
                    {(() => {
                      const due = bookingAmount(b);
                      const covered = walletBalance !== null && walletBalance >= due;
                      return (
                        <button
                          className="ap-pay-option"
                          onClick={() => payFromWallet(b._id)}
                          disabled={payingId === b._id || !covered}
                          title={covered ? "" : "Not enough balance — top up, or pay with eSewa"}
                        >
                          <span className="ap-pay-option-name">👛 My Wallet</span>
                          <span className="ap-pay-option-sub">
                            {walletBalance === null
                              ? "Balance unavailable"
                              : `Balance Rs ${(walletBalance / 100).toFixed(2)}${covered ? "" : " — not enough"}`}
                          </span>
                        </button>
                      );
                    })()}
                    <button
                      className="ap-pay-option"
                      onClick={() => payWithEsewa(b._id)}
                      disabled={payingId === b._id}
                    >
                      <span className="ap-pay-option-name">🟢 eSewa</span>
                      <span className="ap-pay-option-sub">Pay the exact amount now</span>
                    </button>
                  </div>
                </div>
              )}

              {openQuoteId === b._id && (
                <div style={{ margin: "10px 0 18px" }}>
                  <PartsQuotePanel bookingId={b._id} side="customer" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BookingsPage;
