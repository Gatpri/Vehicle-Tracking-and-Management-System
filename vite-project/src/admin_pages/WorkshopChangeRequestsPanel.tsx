import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import ServicesTableView from "../components/ServicesTableView";
import type { ServiceRow } from "../components/ServicesTableEditor";

interface ChangeRequest {
  _id: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  workshop: { _id: string; name: string } | null;
  requestedBy: { firstname: string; lastname: string; email: string } | null;
  proposed: Record<string, unknown> & { servicesOffered?: ServiceRow[] };
  snapshot: Record<string, unknown> & { servicesOffered?: ServiceRow[] };
  reviewNote?: string;
}

// Fields other than the services table are shown as plain before/after text —
// a price list needs a table, a phone number doesn't.
const SIMPLE_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  description: "Description",
  address: "Address",
  area: "Area",
  region: "Region",
  contactPhone: "Phone",
  contactEmail: "Email",
};

function WorkshopChangeRequestsPanel({ onApplied }: { onApplied: () => void }) {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/workshop-change-requests", { params: { status: "pending" } });
      setRequests(res.data.requests);
    } catch {
      // A workshop-admin viewing this page has no pending queue of their own
      // to review; failing quietly beats an error toast on every load.
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const review = async (id: string, decision: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await api.patch(`/workshop-change-requests/${id}`, { decision, note: notes[id] ?? "" });
      toast.success(decision === "approved" ? "Changes applied" : "Request rejected");
      load();
      // The workshops table behind this panel is now stale.
      if (decision === "approved") onApplied();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to review request"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="adm-section" style={{ marginBottom: 20 }}>
      <div className="ap-section-title">
        Pending change requests ({requests.length})
      </div>
      {requests.map((r) => {
        const proposedServices = r.proposed.servicesOffered;
        const currentServices = r.snapshot.servicesOffered;
        const simpleKeys = Object.keys(r.proposed).filter((k) => k in SIMPLE_FIELD_LABELS);

        return (
          <div key={r._id} className="uh-card" style={{ marginBottom: 12, padding: 14 }}>
            <div className="ap-row-title">{r.workshop?.name ?? "Unknown workshop"}</div>
            <div className="adm-sub" style={{ marginBottom: 10 }}>
              Requested by {r.requestedBy?.email ?? "unknown"} · {new Date(r.createdAt).toLocaleString()}
            </div>

            {proposedServices && (
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <ServicesTableView rows={currentServices ?? []} caption="Current" />
                <ServicesTableView rows={proposedServices} caption="Proposed" />
              </div>
            )}

            {simpleKeys.length > 0 && (
              <table className="svc-table" style={{ marginTop: 10, maxWidth: 620 }}>
                <thead>
                  <tr><th>Field</th><th>Current</th><th>Proposed</th></tr>
                </thead>
                <tbody>
                  {simpleKeys.map((k) => (
                    <tr key={k}>
                      <td>{SIMPLE_FIELD_LABELS[k]}</td>
                      <td className="adm-sub">{String(r.snapshot[k] ?? "—") || "—"}</td>
                      <td>{String(r.proposed[k] ?? "—") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="svc-input"
                style={{ flex: "1 1 260px" }}
                placeholder="Reason (shown to the workshop, optional)"
                value={notes[r._id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [r._id]: e.target.value }))}
              />
              <button
                className="uh-btn uh-btn-sm uh-btn-primary"
                disabled={busyId === r._id}
                onClick={() => review(r._id, "approved")}
              >
                {busyId === r._id ? "..." : "Approve"}
              </button>
              <button
                className="delete-btn"
                disabled={busyId === r._id}
                onClick={() => review(r._id, "rejected")}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default WorkshopChangeRequestsPanel;
