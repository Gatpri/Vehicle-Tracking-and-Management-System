import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";

interface Wallet {
  balance: number;
  currency: string;
}
interface Transaction {
  _id: string;
  type: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
}

function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [walletRes, txRes] = await Promise.all([api.get("/wallet"), api.get("/wallet/transactions")]);
      setWallet(walletRes.data.wallet);
      setTransactions(txRes.data.transactions);
    } catch {
      toast.error("Failed to load wallet");
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
      const { url, fields } = res.data;
      // Real eSewa redirect: build and submit an actual hidden form (not
      // fetch) — a genuine full-page navigation to eSewa's checkout, exactly
      // how ePay v2 works.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = url;
      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
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
      </div>

      <div className="ap-section-title">Transaction History</div>
      {transactions.length === 0 ? (
        <div className="uh-empty">No transactions yet.</div>
      ) : (
        <div className="uh-list">
          {transactions.map((t) => (
            <div className="ap-row" key={t._id}>
              <div className="ap-row-main">
                <span className="ap-row-title">{t.type} ({t.gateway})</span>
                <span className="ap-row-sub">{new Date(t.createdAt).toLocaleString()}</span>
              </div>
              <div className="ap-row-actions">
                <span>{t.type === "payment" ? "-" : "+"}Rs {(t.amount / 100).toFixed(2)}</span>
                <span className={`uh-badge ${t.status === "success" ? "uh-badge-green" : t.status === "failed" ? "uh-badge-red" : "uh-badge-slate"}`}>
                  {t.status}
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
