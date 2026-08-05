import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
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
interface Summary {
  byType: Record<string, number>;
  inTotal: number;
  outTotal: number;
}
interface WalletRow {
  _id: string;
  balance: number;
  pendingWithdrawal: number;
  user: { _id: string; firstname: string; lastname: string; email: string; role: string } | null;
}

const rs = (paisa: number) => `Rs ${(paisa / 100).toFixed(2)}`;

// Where money of each kind comes from, in words — the summary tiles read as
// explanations rather than as jargon from the database.
const TYPE_LABEL: Record<string, string> = {
  topup: "Top-ups received",
  payment: "Spent on services",
  commission: "Commission earned",
  earning: "Earned from jobs",
  withdrawal: "Withdrawn",
  refund: "Refunded",
  adjustment: "Admin adjustments",
};

function AdminWalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Which wallet's statement is open — the company's, or one user's.
  const [openId, setOpenId] = useState<string | null>(null);
  const [statement, setStatement] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [heading, setHeading] = useState("");
  const [company, setCompany] = useState<{ revenue: number; float: number; esewaId: string } | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [walletsRes, companyRes] = await Promise.all([
          api.get("/wallet/all"),
          api.get("/wallet/company"),
        ]);
        setWallets(walletsRes.data.wallets);
        setCompany(companyRes.data.wallet);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to load wallets"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openStatement = async (id: string, url: string, title: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setHeading(title);
    setLoadingStatement(true);
    try {
      const res = await api.get(url);
      setStatement(res.data.transactions);
      setSummary(res.data.summary);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to load statement"));
      setStatement([]);
      setSummary(null);
    } finally {
      setLoadingStatement(false);
    }
  };

  const visible = wallets.filter((w) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      w.user?.email?.toLowerCase().includes(q) ||
      `${w.user?.firstname} ${w.user?.lastname}`.toLowerCase().includes(q) ||
      w.user?.role?.toLowerCase().includes(q)
    );
  });

  const statementPanel = (
    <>
      {loadingStatement ? (
        <p className="adm-empty">Loading statement...</p>
      ) : (
        <>
          {summary && Object.keys(summary.byType).length > 0 && (
            <div className="adm-float" style={{ marginBottom: 14 }}>
              {Object.entries(summary.byType).map(([type, total]) => (
                <div className="adm-float-stat" key={type}>
                  <span className="adm-float-value">{rs(total)}</span>
                  <span className="adm-float-label">{TYPE_LABEL[type] ?? type}</span>
                </div>
              ))}
            </div>
          )}
          {statement.length === 0 ? (
            <p className="adm-empty">No movements yet.</p>
          ) : (
            <table className="dash-table">
              <thead><tr><th>Where it came from</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {statement.map((e) => (
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
        </>
      )}
    </>
  );

  return (
    <div className="adm-page">
      <div className="adm-page-head"><h2>Wallets</h2></div>

      {company && (
        <>
          <div className="ap-section-title" style={{ marginBottom: 10 }}>Company account</div>
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
              <span className="adm-float-value" style={{ fontSize: 16 }}>{company.esewaId || "not set"}</span>
              <span className="adm-float-label">Company eSewa ID</span>
            </div>
          </div>
          <button
            className="adm-camera-toggle"
            style={{ marginBottom: 20 }}
            onClick={() => openStatement("company", "/wallet/company", "Company account")}
          >
            {openId === "company" ? "Hide commission breakdown" : "Where did the commission come from?"}
          </button>
          {openId === "company" && <div style={{ marginBottom: 26 }}>{statementPanel}</div>}
        </>
      )}

      <div className="ap-section-title" style={{ marginBottom: 10 }}>User &amp; workshop wallets</div>
      <input
        className="adm-wallet-search"
        placeholder="Search by name, email or role..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="adm-empty">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="adm-empty">No wallets found.</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr><th>Holder</th><th>Role</th><th>Balance</th><th>Held</th><th></th></tr>
          </thead>
          <tbody>
            {visible.map((w) => [
              <tr key={w._id}>
                <td>
                  {w.user?.firstname} {w.user?.lastname}
                  <div className="adm-sub">{w.user?.email}</div>
                </td>
                <td><span className={`role-badge role-${w.user?.role}`}>{w.user?.role}</span></td>
                <td><strong>{rs(w.balance)}</strong></td>
                <td>{w.pendingWithdrawal > 0 ? rs(w.pendingWithdrawal) : "—"}</td>
                <td>
                  <button
                    className="adm-camera-toggle"
                    onClick={() =>
                      openStatement(
                        w._id,
                        `/wallet/${w.user?._id}`,
                        `${w.user?.firstname} ${w.user?.lastname}`
                      )
                    }
                  >
                    {openId === w._id ? "Hide" : "Where it came from"}
                  </button>
                </td>
              </tr>,
              openId === w._id && (
                <tr key={`${w._id}-statement`}>
                  <td colSpan={5} style={{ background: "#0e0f19", padding: 14 }}>
                    <div className="adm-sub" style={{ marginBottom: 10 }}>{heading}</div>
                    {statementPanel}
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminWalletsPage;
