import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../lib/AuthContext";
import { isAccountingAdmin, FULL_ADMIN_ROLES } from "../lib/roles";
import "./AdminPages.css";

interface Withdrawal {
  _id: string;
  kind: "user" | "company";
  user: { firstname: string; lastname: string; email: string; role: string } | null;
  amount: number;
  esewaId: string;
  accountName: string;
  status: "pending" | "paid" | "rejected";
  payoutRef: string;
  note: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { firstname: string; lastname: string } | null;
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toFixed(2)}`;

function AdminWithdrawalsPage() {
  const { user: me } = useAuth();
  // Plain admins can see the queue and the float, but only accounting-admin
  // and superadmin may action a payout.
  const canReview = isAccountingAdmin(me?.role) || me?.role === "superadmin";
  const canSeeFloat = canReview || FULL_ADMIN_ROLES.includes(me?.role ?? "");

  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [company, setCompany] = useState<{ revenue: number; float: number; pendingPayouts: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState<Record<string, string>>({});

  const [drawAmount, setDrawAmount] = useState("");
  const [drawEsewa, setDrawEsewa] = useState("");
  const [drawNote, setDrawNote] = useState("");
  const [drawing, setDrawing] = useState(false);

  const submitCompanyDraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setDrawing(true);
    try {
      await api.post("/withdrawals/company", {
        amountNpr: Number(drawAmount),
        esewaId: drawEsewa,
        note: drawNote,
      });
      toast.success("Company withdrawal requested — it needs a payout reference to approve");
      setDrawAmount("");
      setDrawNote("");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to request company withdrawal"));
    } finally {
      setDrawing(false);
    }
  };

  const load = async (status = statusFilter) => {
    setLoading(true);
    try {
      const res = await api.get("/withdrawals", { params: status ? { status } : {} });
      setWithdrawals(res.data.withdrawals);
      setCompany(res.data.company);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load withdrawals"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch on mount, alongside subscribing for live arrivals.
    load();

    const socket = getSocket();
    const onNew = () => {
      toast.info("New withdrawal request");
      load();
    };
    socket.on("withdrawal:new", onNew);
    return () => {
      socket.off("withdrawal:new", onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, action: "approve" | "reject") => {
    if (action === "approve" && !confirm("Confirm you have already sent the real eSewa transfer for this request.")) {
      return;
    }
    setBusyId(id);
    try {
      await api.patch(`/withdrawals/${id}/${action}`, { payoutRef: payoutRef[id] ?? "" });
      toast.success(action === "approve" ? "Marked as paid" : "Rejected — money returned to their wallet");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to ${action}`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Withdrawals</h2></div>

      {canSeeFloat && company && (
        <div className="adm-float">
          <div className="adm-float-stat">
            <span className="adm-float-value">{rs(company.revenue)}</span>
            <span className="adm-float-label">Commission earned</span>
          </div>
          <div className="adm-float-stat">
            <span className="adm-float-value">{rs(company.float)}</span>
            <span className="adm-float-label">Held in eSewa (float)</span>
          </div>
          <div className="adm-float-stat">
            <span className="adm-float-value">{rs(company.pendingPayouts)}</span>
            <span className="adm-float-label">Awaiting payout</span>
          </div>
          <div className="adm-float-stat">
            {/* Payouts come out of the float, not the commission. If they
                exceed it, approving them all would overdraw the real eSewa
                account — worth seeing before actioning any of them. */}
            <span
              className={`adm-float-value ${company.float < company.pendingPayouts ? "adm-float-short" : ""}`}
            >
              {rs(company.float - company.pendingPayouts)}
            </span>
            <span className="adm-float-label">Float after payouts</span>
          </div>
        </div>
      )}

      {/* Drawing down the platform's own commission. Held to a stricter
          standard than a user payout: a reason is required to request it and a
          payout reference to approve it, and it can never exceed the real
          money in eSewa — otherwise it would be spending users' float. */}
      {canReview && company && (
        <details className="adm-company-draw">
          <summary>Withdraw company earnings ({rs(company.revenue)} available)</summary>
          <form onSubmit={submitCompanyDraw}>
            <div className="adm-ws-coords">
              <input
                type="number"
                min="1"
                max={Math.min(company.revenue, company.float) / 100}
                placeholder="Amount (NPR)"
                value={drawAmount}
                onChange={(e) => setDrawAmount(e.target.value)}
                required
              />
              <input
                placeholder="Destination eSewa ID"
                value={drawEsewa}
                onChange={(e) => setDrawEsewa(e.target.value)}
                required
              />
            </div>
            <input
              placeholder="Reason (required — this is recorded permanently)"
              value={drawNote}
              onChange={(e) => setDrawNote(e.target.value)}
              required
            />
            <button className="add-btn" type="submit" disabled={drawing}>
              {drawing ? "Requesting..." : "Request company withdrawal"}
            </button>
          </form>
        </details>
      )}

      <div className="adm-camera-status-row" style={{ marginBottom: 14 }}>
        {["pending", "paid", "rejected", ""].map((s) => (
          <button
            key={s || "all"}
            className={`adm-camera-toggle ${statusFilter === s ? "adm-live-on" : ""}`}
            onClick={() => { setStatusFilter(s); load(s); }}
          >
            {s || "all"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : withdrawals.length === 0 ? (
        <p className="adm-empty">No {statusFilter || ""} withdrawal requests.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>Requested by</th><th>Amount</th><th>Send to eSewa</th>
              <th>Status</th><th>Requested</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w._id}>
                <td>
                  {w.kind === "company" ? (
                    <>
                      <strong className="adm-company-tag">Company earnings</strong>
                      <div className="adm-sub">requested by {w.user?.firstname} {w.user?.lastname}</div>
                    </>
                  ) : (
                    <>
                      {w.user?.firstname} {w.user?.lastname}
                      <div className="adm-sub">{w.user?.email} · {w.user?.role}</div>
                    </>
                  )}
                  {w.note && <div className="adm-sub">“{w.note}”</div>}
                </td>
                <td><strong>{rs(w.amount)}</strong></td>
                <td>
                  <span className="adm-esewa-id">{w.esewaId}</span>
                  {w.accountName && <div className="adm-sub">{w.accountName}</div>}
                </td>
                <td>
                  <span className={`role-badge status-${w.status === "paid" ? "completed" : w.status}`}>{w.status}</span>
                  {w.reviewedBy && (
                    <div className="adm-sub">by {w.reviewedBy.firstname} {w.reviewedBy.lastname}</div>
                  )}
                  {w.payoutRef && <div className="adm-sub">ref {w.payoutRef}</div>}
                </td>
                <td>{new Date(w.createdAt).toLocaleString()}</td>
                <td>
                  {w.status === "pending" && canReview && (
                    <div className="adm-withdraw-actions">
                      <input
                        placeholder="eSewa txn ref"
                        value={payoutRef[w._id] ?? ""}
                        onChange={(e) => setPayoutRef((p) => ({ ...p, [w._id]: e.target.value }))}
                      />
                      <button className="add-btn" disabled={busyId === w._id} onClick={() => act(w._id, "approve")}>
                        Mark paid
                      </button>
                      <button className="delete-btn" disabled={busyId === w._id} onClick={() => act(w._id, "reject")}>
                        Reject
                      </button>
                    </div>
                  )}
                  {w.status === "pending" && !canReview && <span className="adm-sub">awaiting accounting</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="adm-camera-hint">
        Marking a request paid does <strong>not</strong> move real money — send the eSewa transfer from the
        company account first, then record it here. Approving clears the hold on the requester's wallet and
        reduces the company balance to match; rejecting returns the money to them.
      </p>
    </div>
  );
}

export default AdminWithdrawalsPage;
