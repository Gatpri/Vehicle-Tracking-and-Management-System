import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { getSocket } from "../lib/socket";
import "./AdminPages.css";

interface Entry {
  _id: string;
  type: string;
  amount: number;
  status: string;
  createdAt: string;
  direction: "in" | "out";
  source: string;
  statusLabel: string;
}
interface Wallet {
  balance: number;
  pendingWithdrawal: number;
}
interface Withdrawal {
  _id: string;
  amount: number;
  esewaId: string;
  status: "pending" | "paid" | "rejected";
  note: string;
  createdAt: string;
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toFixed(2)}`;

const TYPE_LABEL: Record<string, string> = {
  earning: "Earned from jobs",
  commission: "Commission",
  topup: "Topped up",
  payment: "Spent",
  withdrawal: "Withdrawn",
  refund: "Refunded",
  adjustment: "Admin adjustments",
};

/**
 * An admin-area user's own wallet, rendered inside the dashboard rather than
 * the customer-facing layout — a garage owner reviewing their takings
 * shouldn't be bounced out to the public site to do it.
 *
 * Same endpoints as the user wallet page; only the presentation differs.
 */
function AdminMyWalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [esewaId, setEsewaId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [walletRes, txRes, wdRes] = await Promise.all([
        api.get("/wallet"),
        api.get("/wallet/transactions"),
        api.get("/withdrawals/mine"),
      ]);
      setWallet(walletRes.data.wallet);
      setEntries(txRes.data.transactions);
      setSummary(txRes.data.summary?.byType ?? {});
      setWithdrawals(wdRes.data.withdrawals);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load your wallet"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    // A job settling credits this wallet server-side; refresh so the balance
    // doesn't sit stale while the page is open.
    const socket = getSocket();
    const onWallet = () => load();
    socket.on("wallet:updated", onWallet);
    return () => {
      socket.off("wallet:updated", onWallet);
    };
  }, []);

  const requestWithdrawal = async (e: FormEvent) => {
    e.preventDefault();
    const amountNpr = Number(amount);
    if (!amountNpr || amountNpr <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/withdrawals", { amountNpr, esewaId, accountName });
      toast.success("Withdrawal requested — accounting will review it");
      setAmount("");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to request withdrawal"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="adm-page"><p className="adm-empty">Loading...</p></div>;

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>My Earnings</h2></div>

      <div className="adm-float">
        <div className="adm-float-stat">
          <span className="adm-float-value">{rs(wallet?.balance ?? 0)}</span>
          <span className="adm-float-label">Available to withdraw</span>
        </div>
        {(wallet?.pendingWithdrawal ?? 0) > 0 && (
          <div className="adm-float-stat">
            <span className="adm-float-value" style={{ color: "#fbbf24" }}>
              {rs(wallet?.pendingWithdrawal ?? 0)}
            </span>
            <span className="adm-float-label">Held — awaiting review</span>
          </div>
        )}
        {Object.entries(summary).map(([type, total]) => (
          <div className="adm-float-stat" key={type}>
            <span className="adm-float-value">{rs(total)}</span>
            <span className="adm-float-label">{TYPE_LABEL[type] ?? type}</span>
          </div>
        ))}
      </div>

      <div className="ap-section-title" style={{ marginBottom: 10 }}>Withdraw to eSewa</div>
      <form className="adm-ws-panel" style={{ maxWidth: 520 }} onSubmit={requestWithdrawal}>
        <div className="adm-ws-coords">
          <input
            type="number"
            min="1"
            max={(wallet?.balance ?? 0) / 100}
            placeholder="Amount (NPR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input
            placeholder="Your eSewa ID (98XXXXXXXX)"
            value={esewaId}
            onChange={(e) => setEsewaId(e.target.value)}
            required
          />
        </div>
        <input
          placeholder="Account name (optional)"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <span className="adm-ws-hint">
          The amount is held out of your balance while an accounting admin checks it, and returned in full if
          the request is rejected.
        </span>
        <button className="add-btn" type="submit" disabled={submitting || (wallet?.balance ?? 0) <= 0}>
          {submitting ? "Requesting..." : "Request Withdrawal"}
        </button>
      </form>

      {withdrawals.length > 0 && (
        <>
          <div className="ap-section-title" style={{ marginTop: 26, marginBottom: 10 }}>My Withdrawals</div>
          <table className="dash-table">
            <thead><tr><th>Amount</th><th>To eSewa</th><th>Status</th><th>Requested</th></tr></thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w._id}>
                  <td><strong>{rs(w.amount)}</strong></td>
                  <td><span className="adm-esewa-id">{w.esewaId}</span></td>
                  <td>
                    <span className={`role-badge status-${w.status === "paid" ? "completed" : w.status}`}>
                      {w.status}
                    </span>
                    {w.note && <div className="adm-sub">{w.note}</div>}
                  </td>
                  <td>{new Date(w.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="ap-section-title" style={{ marginTop: 26, marginBottom: 10 }}>Where the money came from</div>
      {entries.length === 0 ? (
        <p className="adm-empty">No movements yet.</p>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Source</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e._id}>
                <td>{e.source}</td>
                <td className={e.direction === "out" ? "adm-amount-out" : "adm-amount-in"}>
                  {e.direction === "out" ? "−" : "+"}{rs(e.amount)}
                </td>
                <td><span className={`adm-money-status s-${e.status}`}>{e.statusLabel}</span></td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminMyWalletPage;
