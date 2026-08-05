import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface Workshop {
  _id: string;
  name: string;
  description: string;
  address: string;
  contactPhone: string;
  servicesOffered: { serviceType: string; basePrice: number }[];
  rating: { average: number; count: number };
  sentiment: { score: number; positiveRatio: number; scoredCount: number };
  brandsSupported: string[];
  bikeTypes: string[];
}

interface Vehicle {
  _id: string;
  plateNumber: string;
  make: string;
  model: string;
}

interface Review {
  _id: string;
  rating: number;
  text: string;
  createdAt: string;
  user: { firstname: string; lastname: string } | null;
  sentiment: { label: string; language: string };
}

interface ReviewableBooking {
  _id: string;
  serviceType: string;
  workshop: { _id: string; name: string } | null;
}

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "uh-badge-green",
  negative: "uh-badge-red",
  neutral: "uh-badge-slate",
};

function WorkshopDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [vehicleId, setVehicleId] = useState(searchParams.get("vehicleId") || "");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [deliveryRequested, setDeliveryRequested] = useState(false);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [locating, setLocating] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewable, setReviewable] = useState<ReviewableBooking[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewBookingId, setReviewBookingId] = useState("");
  const [postingReview, setPostingReview] = useState(false);

  const loadReviews = async () => {
    try {
      const res = await api.get(`/workshops/${id}/reviews`);
      setReviews(res.data.reviews);
    } catch {
      // A failed review fetch shouldn't block the booking form, which is the
      // page's primary job.
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [workshopRes, vehiclesRes] = await Promise.all([
          api.get(`/workshops/${id}`),
          api.get("/vehicles/mine"),
        ]);
        setWorkshop(workshopRes.data.workshop);
        setVehicles(vehiclesRes.data.vehicles);
        loadReviews();
        // Completed bookings at *this* workshop that the user hasn't reviewed —
        // the only bookings a review can be attached to.
        api
          .get("/reviews/pending")
          .then((res) =>
            setReviewable(
              (res.data.bookings as ReviewableBooking[]).filter((b) => b.workshop?._id === id)
            )
          )
          .catch(() => setReviewable([]));
        if (workshopRes.data.workshop.servicesOffered.length > 0) {
          setServiceType(workshopRes.data.workshop.servicesOffered[0].serviceType);
        }
      } catch {
        toast.error("Failed to load workshop");
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const detectPickupLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickupLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Pickup location captured");
        setLocating(false);
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setLocating(false);
      }
    );
  };

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle first");
      return;
    }
    if (deliveryRequested && !pickupLocation) {
      toast.error("Set your pickup location first — delivery staff will collect the vehicle there");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/bookings", {
        vehicleId,
        workshopId: id,
        serviceType,
        description,
        deliveryRequested,
        ...(deliveryRequested && { pickupLocation: { ...pickupLocation, address: pickupAddress } }),
      });
      toast.success("Booking requested");
      navigate("/bookings");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create booking"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewBookingId) {
      toast.error("Select which service you're reviewing");
      return;
    }
    setPostingReview(true);
    try {
      await api.post("/reviews", {
        serviceRequestId: reviewBookingId,
        rating: reviewRating,
        text: reviewText,
      });
      toast.success("Thanks — your review is published");
      setReviewText("");
      setReviewBookingId("");
      setReviewRating(5);
      setReviewable((prev) => prev.filter((b) => b._id !== reviewBookingId));
      loadReviews();
      const res = await api.get(`/workshops/${id}`);
      setWorkshop(res.data.workshop);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to post review"));
    } finally {
      setPostingReview(false);
    }
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;
  if (!workshop) return <div className="uh-page"><p>Workshop not found.</p></div>;

  return (
    <div className="uh-page">
      <Link to="/workshops" className="ap-back-link">← Back to Workshops</Link>

      <div className="ap-detail-header">
        <div>
          <h1>{workshop.name}</h1>
          <p>{workshop.address} · ★ {workshop.rating.average.toFixed(1)} ({workshop.rating.count})</p>
        </div>
      </div>

      {workshop.description && <p style={{ marginBottom: 20 }}>{workshop.description}</p>}

      <div className="ap-section-title">Services & Pricing</div>
      <div className="uh-list" style={{ marginBottom: 28 }}>
        {workshop.servicesOffered.map((s) => (
          <div className="ap-row" key={s.serviceType}>
            <span className="ap-row-title">{s.serviceType}</span>
            <span className="ap-row-sub">Rs {(s.basePrice / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="ap-section-title">Book a Service</div>
      <div className="uh-card">
        {vehicles.length === 0 ? (
          <p>You need a registered vehicle first. <Link to="/vehicles">Add one here</Link>.</p>
        ) : (
          <form onSubmit={handleBook}>
            <div className="uh-form-row">
              <div className="uh-field">
                <label htmlFor="vehicleId">Vehicle</label>
                <select id="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                  <option value="">Select a vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v._id} value={v._id}>{v.plateNumber} — {v.make} {v.model}</option>
                  ))}
                </select>
              </div>
              <div className="uh-field">
                <label htmlFor="serviceType">Service</label>
                <select id="serviceType" value={serviceType} onChange={(e) => setServiceType(e.target.value)} required>
                  {workshop.servicesOffered.map((s) => (
                    <option key={s.serviceType} value={s.serviceType}>{s.serviceType}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="uh-field">
              <label htmlFor="description">Notes (optional)</label>
              <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="uh-field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={deliveryRequested}
                  onChange={(e) => setDeliveryRequested(e.target.checked)}
                />
                Request pickup &amp; drop-off delivery (extra service — otherwise you'll bring the vehicle yourself)
              </label>
            </div>
            {deliveryRequested && (
              <div className="uh-form-row">
                <div className="uh-field">
                  <label htmlFor="pickupAddress">Pickup address (optional label)</label>
                  <input
                    id="pickupAddress"
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="e.g. Thamel, Kathmandu"
                  />
                </div>
                <div className="uh-field">
                  <label>Pickup location</label>
                  <button type="button" className="uh-btn uh-btn-sm uh-btn-ghost" onClick={detectPickupLocation} disabled={locating}>
                    {locating ? "Locating..." : pickupLocation ? "Update my location" : "Use my current location"}
                  </button>
                  {pickupLocation && (
                    <span className="ap-row-sub" style={{ display: "block", marginTop: 6 }}>
                      {pickupLocation.lat.toFixed(5)}, {pickupLocation.lng.toFixed(5)}
                    </span>
                  )}
                </div>
              </div>
            )}
            <button className="uh-btn uh-btn-orange" type="submit" disabled={submitting}>
              {submitting ? "Requesting..." : "Request Booking"}
            </button>
          </form>
        )}
      </div>

      <div className="ap-section-title" style={{ marginTop: 28 }}>
        Reviews
        {workshop.sentiment?.scoredCount > 0 && (
          <span className="ap-review-summary">
            {Math.round(workshop.sentiment.positiveRatio * 100)}% positive
            from {workshop.sentiment.scoredCount} analysed review
            {workshop.sentiment.scoredCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Only shown when this user has a completed, unreviewed service here —
          the API enforces the same rule, so there's no form to game. */}
      {reviewable.length > 0 && (
        <form className="uh-card ap-review-form" onSubmit={submitReview}>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="reviewBooking">Which service?</label>
              <select
                id="reviewBooking"
                value={reviewBookingId}
                onChange={(e) => setReviewBookingId(e.target.value)}
                required
              >
                <option value="">Select a completed service</option>
                {reviewable.map((b) => (
                  <option key={b._id} value={b._id}>{b.serviceType}</option>
                ))}
              </select>
            </div>
            <div className="uh-field" style={{ maxWidth: 140 }}>
              <label htmlFor="reviewRating">Rating</label>
              <select
                id="reviewRating"
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{"★".repeat(n)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="uh-field">
            <label htmlFor="reviewText">Your feedback</label>
            <textarea
              id="reviewText"
              rows={3}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Write in Nepali, Romanized Nepali or English — e.g. सेवा राम्रो थियो / sewa ramro thiyo / great service"
            />
          </div>
          <button className="uh-btn uh-btn-primary" type="submit" disabled={postingReview}>
            {postingReview ? "Posting..." : "Post Review"}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <div className="uh-empty">No reviews yet.</div>
      ) : (
        <div className="uh-list">
          {reviews.map((r) => (
            <div className="ap-row ap-review-row" key={r._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">
                  {"★".repeat(r.rating)}
                  <span className="ap-review-author">
                    {r.user ? ` ${r.user.firstname} ${r.user.lastname}` : " Customer"}
                  </span>
                </span>
                {r.text && <span className="ap-row-sub">{r.text}</span>}
                <span className="ap-review-date">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              {/* "pending" means the classifier hasn't scored it yet — shown
                  rather than hidden so it's obvious the model is offline. */}
              {r.sentiment?.label && r.sentiment.label !== "unavailable" && (
                <span className={`uh-badge ${SENTIMENT_BADGE[r.sentiment.label] ?? "uh-badge-slate"}`}>
                  {r.sentiment.label}
                  {r.sentiment.language ? ` · ${r.sentiment.language}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkshopDetailPage;
