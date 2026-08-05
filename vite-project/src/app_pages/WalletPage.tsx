import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { redirectToEsewa } from "../lib/esewa";

interface Wallet {
  balance: number;
  pendingWithdrawal: number;
  currency: string;
}
interface Withdrawal {
  _id: string;
  amount: number;
  esewaId: string;
  status: "pending" | "paid" | "rejected";
  note: string;
  createdAt: string;
}
interface Transaction {
  _id: string;
  type: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
  // Plain-language origin, built server-side so every view of this movement
  // describes it identically.
  direction: "in" | "out";
  source: string;
  statusLabel: string;
}

function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [companyEsewaId, setCompanyEsewaId] = useState("");
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wdAmount, setWdAmount] = useState("");
  const [wdEsewaId, setWdEsewaId] = useState("");
  const [wdName, setWdName] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const load = async () => {
    try {
      const [walletRes, txRes, wdRes] = await Promise.all([
        api.get("/wallet"),
        api.get("/wallet/transactions"),
        api.get("/withdrawals/mine"),
      ]);
      setWallet(walletRes.data.wallet);
      setCompanyEsewaId(walletRes.data.companyEsewaId ?? "");
      setTransactions(txRes.data.transactions);
      setWithdrawals(wdRes.data.withdrawals);
    } catch {
      toast.error("Failed to load wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e: FormEvent) => {
    e.preventDefault();
    const amountNpr = Number(wdAmount);
    if (!amountNpr || amountNpr <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setWithdrawing(true);
    try {
      await api.post("/withdrawals", { amountNpr, esewaId: wdEsewaId, accountName: wdName });
      toast.success("Withdrawal requested — an accounting admin will review it");
      setWdAmount("");
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to request withdrawal"));
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    const initial = async () => {
      await load();
    };
    initial();
  }, []);

  useEffect(() => {
    const status = searchParams.get("status");
    if (!status) return;
    if (status === "success") toast.success("Top-up successful!");
    else toast.error(`Top-up ${status}`);
    setSearchParams({}, { replace: true });
    const refetch = async () => {
      await load();
    };
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTopup = async (e: FormEvent) => {
    e.preventDefault();
    const amountNpr = Number(amount);
    if (!amountNpr || amountNpr <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/wallet/topup/initiate", { amountNpr });
      redirectToEsewa(res.data.url, res.data.fields);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start top-up"));
      setSubmitting(false);
    }
  };

  if (loading) return <div className="uh-page"><p>Loading...</p></div>;

  return (
    <div className="uh-page">
      <h1 style={{ marginBottom: 20 }}>Wallet</h1>

      <div className="ap-balance-card">
        <div className="ap-balance-label">Available Balance</div>
        <div className="ap-balance-amount">Rs {((wallet?.balance ?? 0) / 100).toFixed(2)}</div>
        {(wallet?.pendingWithdrawal ?? 0) > 0 && (
          <div className="ap-balance-pending">
            Rs {((wallet?.pendingWithdrawal ?? 0) / 100).toFixed(2)} held for a withdrawal being reviewed
          </div>
        )}
      </div>

      <div className="uh-card" style={{ marginBottom: 28 }}>
        <form onSubmit={handleTopup} className="uh-form-row" style={{ alignItems: "flex-end" }}>
          <div className="uh-field" style={{ marginBottom: 0 }}>
            <label htmlFor="amount">Top up amount (NPR)</label>
            <input id="amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <button className="uh-btn uh-btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Redirecting..." : "Top Up via eSewa"}
          </button>
        </form>
        {companyEsewaId && (
          <p className="ap-photo-hint" style={{ marginTop: 12, marginBottom: 0 }}>
            Payments go to the company eSewa account <strong>{companyEsewaId}</strong>, and your balance here
            is credited once eSewa confirms it.
          </p>
        )}
      </div>

      <div className="ap-section-title">Withdraw to eSewa</div>
      <p className="ap-photo-hint">
        Requests are checked by an accounting admin before the transfer is sent. The amount is held out of
        your balance while it's being reviewed, and returned in full if it's rejected.
      </p>
      <div className="uh-card" style={{ marginBottom: 28 }}>
        <form onSubmit={handleWithdraw}>
          <div className="uh-form-row">
            <div className="uh-field">
              <label htmlFor="wdAmount">Amount (NPR)</label>
              <input
                id="wdAmount"
                type="number"
                min="1"
                max={(wallet?.balance ?? 0) / 100}
                value={wdAmount}
                onChange={(e) => setWdAmount(e.target.value)}
                required
              />
            </div>
            <div className="uh-field">
              <label htmlFor="wdEsewa">Your eSewa ID</label>
              <input
                id="wdEsewa"
                placeholder="98XXXXXXXX"
                value={wdEsewaId}
                onChange={(e) => setWdEsewaId(e.target.value)}
                required
              />
            </div>
            <div className="uh-field">
              <label htmlFor="wdName">Account name (optional)</label>
              <input id="wdName" value={wdName} onChange={(e) => setWdName(e.target.value)} />
            </div>
          </div>
          <button className="uh-btn uh-btn-orange" type="submit" disabled={withdrawing || (wallet?.balance ?? 0) <= 0}>
            {withdrawing ? "Requesting..." : "Request Withdrawal"}
          </button>
        </form>
      </div>

      {withdrawals.length > 0 && (
        <>
          <div className="ap-section-title">My Withdrawals</div>
          <div className="uh-list" style={{ marginBottom: 28 }}>
            {withdrawals.map((w) => (
              <div className="ap-row" key={w._id}>
                <div className="ap-row-main">
                  <span className="ap-row-title">Rs {(w.amount / 100).toFixed(2)} → {w.esewaId}</span>
                  <span className="ap-row-sub">
                    {new Date(w.createdAt).toLocaleString()}
                    {w.note && ` · ${w.note}`}
                  </span>
                </div>
                <span className={`uh-badge ${w.status === "paid" ? "uh-badge-green" : w.status === "rejected" ? "uh-badge-red" : "uh-badge-slate"}`}>
                  {w.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ap-section-title">Transaction History</div>
      {transactions.length === 0 ? (
        <div className="uh-empty">No transactions yet.</div>
      ) : (
        <div className="uh-list">
          {transactions.map((t) => (
            <div className="ap-row" key={t._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">{t.source}</span>
                <span className="ap-row-sub">
                  {new Date(t.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="ap-row-actions">
                <span className={t.direction === "out" ? "ap-amount-out" : "ap-amount-in"}>
                  {t.direction === "out" ? "−" : "+"}Rs {(t.amount / 100).toFixed(2)}
                </span>
                <span className={`uh-badge ${t.status === "success" ? "uh-badge-green" : t.status === "failed" ? "uh-badge-red" : "uh-badge-slate"}`}>
                  {t.statusLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WalletPage;
