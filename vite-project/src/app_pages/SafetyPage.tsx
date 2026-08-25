import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import api from "../lib/api";

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
/**
 * Safety: where thefts have been reported, and what you have reported.
 *
 * Filing a report lives on the SOS page instead — that is where someone goes
 * when something has just gone wrong, and it already has the map picker. This
 * page is for looking, not acting.
 */
function SafetyPage() {
  const [points, setPoints] = useState<HeatPoint[]>([]);
  const [myReports, setMyReports] = useState<TheftReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [heatRes, mineRes] = await Promise.all([
        api.get("/theft-reports/heatmap"),
        api.get("/theft-reports/mine"),
      ]);
      setPoints(heatRes.data.points);
      setMyReports(mineRes.data.reports);
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

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  const center: [number, number] = points[0] ? [points[0].location.lat, points[0].location.lng] : [27.7172, 85.324];

  return (
    <div className="uh-page">
      <div className="uh-page-head">
        <h1>Safety</h1>
        {/* Reporting lives behind the SOS button now — this is a signpost to
            it, not a second way in. */}
        <Link className="uh-btn uh-btn-outline" to="/sos">
          Report a theft via SOS
        </Link>
      </div>

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
