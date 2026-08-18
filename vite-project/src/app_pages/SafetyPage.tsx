import { useEffect, useState, type FormEvent } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import LocationPicker, { type LatLng } from "../components/LocationPicker";

// One cluster of nearby incidents, not one incident — the backend groups them
// by proximity so a repeatedly-hit spot reads hotter than a one-off.
interface HeatPoint {
  location: { lat: number; lng: number };
  count: number;
  intensity: "high" | "medium" | "low";
  latestAt: string;
  sources: { report?: number; camera?: number; sos?: number };
  confirmed: boolean;
}

const INTENSITY_STYLE = {
  high: { color: "#ef4444", label: "High" },
  medium: { color: "#f97316", label: "Medium" },
  low: { color: "#22c55e", label: "Minimal" },
} as const;
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
  // Where the vehicle was taken from — which is rarely where the owner is
  // standing when they file, so this is picked on a map rather than read from
  // the device. Null until they choose; "My location" in the picker is one of
  // the ways to fill it, not the only one.
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locationLabel, setLocationLabel] = useState("");

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

  const handleReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    if (!location) {
      toast.error("Mark on the map where the vehicle was last seen");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/theft-reports", {
        vehicleId,
        lat: location.lat,
        lng: location.lng,
        description,
      });
      toast.success("Theft report filed — vehicle flagged as stolen");
      setDescription("");
      setLocation(null);
      setLocationLabel("");
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to file report"));
    } finally {
      setSubmitting(false);
    }
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
            <label>Where was it last seen?</label>
            <LocationPicker
              value={location}
              onChange={setLocation}
              onAddressResolved={setLocationLabel}
              height={280}
            />
            {locationLabel && <span className="ap-row-sub">{locationLabel}</span>}
          </div>
          <div className="uh-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="uh-btn uh-btn-danger" type="submit" disabled={submitting || !location}>
            {submitting ? "Filing..." : "File Report"}
          </button>
        </form>
      )}

      <div className="ap-section-title">Theft Heatmap</div>
      <p className="ap-heat-legend">
        Circles grow and redden with how many incidents cluster in one spot.
        <span className="ap-heat-key"><i style={{ background: INTENSITY_STYLE.high.color }} /> High (5+)</span>
        <span className="ap-heat-key"><i style={{ background: INTENSITY_STYLE.medium.color }} /> Medium (2-4)</span>
        <span className="ap-heat-key"><i style={{ background: INTENSITY_STYLE.low.color }} /> Minimal (1)</span>
      </p>
      <div className="ap-map-wrap short" style={{ marginBottom: 28 }}>
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.map((p, i) => {
            const style = INTENSITY_STYLE[p.intensity];
            return (
              <CircleMarker
                key={i}
                center={[p.location.lat, p.location.lng]}
                // Scale with the count so a hot cluster reads at a glance,
                // capped so one bad junction can't swallow the map.
                radius={Math.min(9 + p.count * 2.5, 26)}
                className={p.intensity === "high" ? "ap-heat-pulse" : undefined}
                pathOptions={{ color: style.color, fillColor: style.color, fillOpacity: 0.35, weight: 2 }}
              >
                <Popup>
                  <strong>{style.label} risk</strong> — {p.count} incident{p.count === 1 ? "" : "s"}
                  <br />
                  {[
                    p.sources.camera && `${p.sources.camera} camera detection${p.sources.camera === 1 ? "" : "s"}`,
                    p.sources.report && `${p.sources.report} owner report${p.sources.report === 1 ? "" : "s"}`,
                    p.sources.sos && `${p.sources.sos} confirmed SOS`,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  Latest: {new Date(p.latestAt).toLocaleDateString()}
                  {p.confirmed && (
                    <>
                      <br />
                      <strong style={{ color: "#b91c1c" }}>Owner-confirmed theft</strong>
                    </>
                  )}
                </Popup>
              </CircleMarker>
            );
          })}
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
