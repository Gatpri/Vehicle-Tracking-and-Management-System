import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../lib/api";

interface HistoryEntry {
  _id: string;
  serviceType: string;
  description: string;
  workshop: { _id: string; name: string; address: string; logoUrl: string } | null;
  completedAt: string;
  finalPrice: number | null;
  partsReplaced: { part: string; price: number }[];
  partsTotal: number;
  daysSincePrevious: number | null;
}

interface HistoryResponse {
  vehicle: { plateNumber: string; make: string; model: string };
  history: HistoryEntry[];
  summary: { totalServices: number; totalSpent: number; lastServicedAt: string | null };
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toFixed(2)}`;

function ServiceHistoryPage() {
  const { vehicleId } = useParams();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Computed once when the data lands, not during render: reading the clock
  // while rendering makes the output depend on when React happens to re-run.
  const [daysSinceLast, setDaysSinceLast] = useState<number | null>(null);

  useEffect(() => {
    api
      .get(`/vehicles/${vehicleId}/service-history`)
      .then((res) => {
        setData(res.data);
        const last = res.data.summary?.lastServicedAt;
        setDaysSinceLast(last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null);
      })
      .catch(() => toast.error("Failed to load service history"))
      .finally(() => setLoading(false));
  }, [vehicleId]);

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;
  if (!data) return <div className="uh-page"><p>Service history not found.</p></div>;

  return (
    <div className="uh-page">
      <Link to={`/vehicles/${vehicleId}`} className="ap-back-link">← Back to Vehicle</Link>

      <div className="ap-detail-header">
        <div>
          <h1>Service History</h1>
          <p>{data.vehicle.plateNumber} · {data.vehicle.make} {data.vehicle.model}</p>
        </div>
      </div>

      <div className="sh-summary">
        <div className="sh-stat">
          <span className="sh-stat-value">{data.summary.totalServices}</span>
          <span className="sh-stat-label">Services completed</span>
        </div>
        <div className="sh-stat">
          <span className="sh-stat-value">{rs(data.summary.totalSpent)}</span>
          <span className="sh-stat-label">Total spent</span>
        </div>
        <div className="sh-stat">
          <span className="sh-stat-value">{daysSinceLast === null ? "—" : `${daysSinceLast}d`}</span>
          <span className="sh-stat-label">Since last service</span>
        </div>
      </div>

      {data.history.length === 0 ? (
        <div className="uh-empty">No completed services yet.</div>
      ) : (
        <div className="sh-timeline">
          {data.history.map((entry) => (
            <article className="sh-entry" key={entry._id}>
              <div className="sh-entry-head">
                <div className="sh-entry-title">
                  {entry.workshop?.logoUrl && (
                    <img className="sh-logo" src={entry.workshop.logoUrl} alt={entry.workshop.name} />
                  )}
                  <div>
                    <h3>{entry.serviceType}</h3>
                    <span className="sh-entry-sub">
                      {entry.workshop?.name ?? "Workshop"}
                      {entry.workshop?.address ? ` · ${entry.workshop.address}` : ""}
                    </span>
                  </div>
                </div>
                <div className="sh-entry-when">
                  <span>{new Date(entry.completedAt).toLocaleDateString()}</span>
                  {/* The gap since the previous visit — the number that tells
                      an owner whether they're servicing often enough. */}
                  {entry.daysSincePrevious !== null && (
                    <span className="sh-interval">{entry.daysSincePrevious} days after previous</span>
                  )}
                </div>
              </div>

              {entry.description && <p className="sh-notes">{entry.description}</p>}

              {entry.partsReplaced.length > 0 && (
                <table className="sh-parts">
                  <thead>
                    <tr><th>Parts replaced</th><th className="sh-right">Price</th></tr>
                  </thead>
                  <tbody>
                    {entry.partsReplaced.map((p) => (
                      <tr key={p.part}>
                        <td>{p.part}</td>
                        <td className="sh-right">{rs(p.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Parts total</td>
                      <td className="sh-right">{rs(entry.partsTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              <div className="sh-entry-foot">
                <span>Paid</span>
                <strong>{entry.finalPrice != null ? rs(entry.finalPrice) : "—"}</strong>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default ServiceHistoryPage;
