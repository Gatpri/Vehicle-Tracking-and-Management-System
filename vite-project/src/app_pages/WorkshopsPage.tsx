import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../lib/api";

interface Workshop {
  _id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  servicesOffered: { serviceType: string; basePrice: number }[];
  rating: { average: number; count: number };
}

function WorkshopsPage() {
  const [searchParams] = useSearchParams();
  const vehicleId = searchParams.get("vehicleId") || "";

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [distances, setDistances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState("");
  const [locating, setLocating] = useState(false);

  const load = async (type?: string) => {
    setLoading(true);
    try {
      const res = await api.get("/workshops", { params: type ? { serviceType: type } : {} });
      setWorkshops(res.data.workshops);
      setDistances({});
    } catch {
      toast.error("Failed to load workshops");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();
  }, []);

  const findNearMe = () => {
    if (!serviceType.trim()) {
      toast.error("Enter a service type first, e.g. oil_change");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.get("/workshops/recommend", {
            params: { lat: pos.coords.latitude, lng: pos.coords.longitude, serviceType },
          });
          const ranked = res.data.recommendations as { workshop: Workshop; distanceKm: number }[];
          setWorkshops(ranked.map((r) => r.workshop));
          setDistances(Object.fromEntries(ranked.map((r) => [r.workshop._id, r.distanceKm])));
        } catch {
          toast.error("Failed to fetch recommendations");
        } finally {
          setLocating(false);
        }
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setLocating(false);
      }
    );
  };

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Workshops</h1>
      </div>

      <div className="uh-card" style={{ marginBottom: 24 }}>
        <div className="uh-form-row" style={{ alignItems: "flex-end" }}>
          <div className="uh-field" style={{ marginBottom: 0 }}>
            <label htmlFor="serviceType">Service type</label>
            <input
              id="serviceType"
              placeholder="e.g. oil_change"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            />
          </div>
          <button className="uh-btn uh-btn-ghost" onClick={() => load(serviceType || undefined)}>Filter</button>
          <button className="uh-btn uh-btn-primary" onClick={findNearMe} disabled={locating}>
            {locating ? "Locating..." : "Find Near Me"}
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : workshops.length === 0 ? (
        <div className="uh-empty">No workshops found.</div>
      ) : (
        <div className="ap-grid">
          {workshops.map((w) => (
            <Link
              key={w._id}
              to={`/workshops/${w._id}${vehicleId ? `?vehicleId=${vehicleId}` : ""}`}
              className="ap-item-card"
            >
              <div className="ap-item-card-top">
                <h3>{w.name}</h3>
                {distances[w._id] !== undefined && (
                  <span className="uh-badge uh-badge-blue">{distances[w._id].toFixed(1)} km</span>
                )}
              </div>
              <div className="ap-item-meta">
                <span>{w.address}</span>
                <span>★ {w.rating.average.toFixed(1)} ({w.rating.count})</span>
                <span>{w.servicesOffered.map((s) => s.serviceType).join(", ")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkshopsPage;
