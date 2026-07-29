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
}

interface Vehicle {
  _id: string;
  plateNumber: string;
  make: string;
  model: string;
}

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

  useEffect(() => {
    const load = async () => {
      try {
        const [workshopRes, vehiclesRes] = await Promise.all([
          api.get(`/workshops/${id}`),
          api.get("/vehicles/mine"),
        ]);
        setWorkshop(workshopRes.data.workshop);
        setVehicles(vehiclesRes.data.vehicles);
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
  }, [id]);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle first");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/bookings", { vehicleId, workshopId: id, serviceType, description });
      toast.success("Booking requested");
      navigate("/bookings");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create booking"));
    } finally {
      setSubmitting(false);
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
            <button className="uh-btn uh-btn-orange" type="submit" disabled={submitting}>
              {submitting ? "Requesting..." : "Request Booking"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default WorkshopDetailPage;
