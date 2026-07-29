import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface HeatPoint {
  location: { lat: number; lng: number };
  status: string;
  createdAt: string;
}
interface TheftReport {
  _id: string;
  vehicle: { plateNumber: string; make: string; model: string };
  description: string;
  status: "open" | "recovered" | "closed";
  createdAt: string;
}
interface Vehicle {
  _id: string;
  plateNumber: string;
}

function SafetyPage() {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const [myReports, setMyReports] = useState<TheftReport[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [heatRes, mineRes, vehiclesRes] = await Promise.all([
        api.get("/theft-reports/heatmap"),
        api.get("/theft-reports/mine"),
        api.get("/vehicles/mine"),
      ]);
      setPoints(heatRes.data.points);
      setMyReports(mineRes.data.reports);
      setVehicles(vehiclesRes.data.vehicles);
    } catch {
      toast.error("Failed to load safety data");
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

  const handleReport = (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser");
      return;
    }
    setSubmitting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.post("/theft-reports", {
            vehicleId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            description,
          });
          toast.success("Theft report filed — vehicle flagged as stolen");
          setDescription("");
          setShowForm(false);
          load();
        } catch (err) {
          toast.error(getErrorMessage(err, "Failed to file report"));
        } finally {
          setSubmitting(false);
        }
      },
      () => {
        toast.error("Couldn't get your location — check browser permissions");
        setSubmitting(false);
      }
    );
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  const center: [number, number] = points[0] ? [points[0].location.lat, points[0].location.lng] : [27.7172, 85.324];

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Safety</h1>
        <button className="uh-btn uh-btn-danger" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Report Stolen Vehicle"}
        </button>
      </div>

      {showForm && (
        <form className="uh-card" style={{ marginBottom: 24 }} onSubmit={handleReport}>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="vehicleId">Vehicle</label>
              <select id="vehicleId" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                <option value="">Select a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>{v.plateNumber}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="uh-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="uh-btn uh-btn-danger" type="submit" disabled={submitting}>
            {submitting ? "Filing..." : "File Report (uses my current location)"}
          </button>
        </form>
      )}

      <div className="ap-section-title">Theft Heatmap</div>
      <div className="ap-map-wrap short" style={{ marginBottom: 28 }}>
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.map((p, i) => (
            <CircleMarker key={i} center={[p.location.lat, p.location.lng]} radius={9} pathOptions={{ color: "#ef4444", fillOpacity: 0.5 }}>
              <Popup>Reported {new Date(p.createdAt).toLocaleDateString()}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="ap-section-title">My Reports</div>
      {myReports.length === 0 ? (
        <div className="uh-empty">No theft reports filed.</div>
      ) : (
        <div className="uh-list">
          {myReports.map((r) => (
            <div className="ap-row" key={r._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">{r.vehicle?.plateNumber} — {r.vehicle?.make} {r.vehicle?.model}</span>
                <span className="ap-row-sub">{r.description || "No description"} · {new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <span className={`uh-badge ${r.status === "recovered" ? "uh-badge-green" : r.status === "closed" ? "uh-badge-slate" : "uh-badge-red"}`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SafetyPage;
