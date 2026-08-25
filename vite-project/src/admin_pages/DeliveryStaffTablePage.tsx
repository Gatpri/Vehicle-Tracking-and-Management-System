import { useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import api, { getErrorMessage } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { DELIVERY_ADMIN_ROLE } from "../lib/roles";

interface StaffRow {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  area: string;
  region: string;
  deliveryRating: { average: number; count: number };
  lastSeenAt: string | null;
  /**
   * Server-computed: may the caller add/delete this staff member? Absent for
   * unscoped callers (admin/superadmin), who may act on anyone — so only an
   * explicit `false` withholds the controls.
   */
  canManage?: boolean;
}

const isOnline = (lastSeenAt: string | null) =>
  !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 120000;

const EMPTY_FORM = { firstname: "", lastname: "", email: "", password: "", area: "", region: "" };

/**
 * Delivery-staff administration.
 *
 * A delivery-admin sees **every** staff member nationwide but may only add or
 * delete within their own region. Visibility and authority are separated
 * deliberately: knowing who covers a neighbouring region helps when a delivery
 * crosses a boundary, while staffing decisions stay local.
 *
 * The region rule is not reimplemented here — the server sends `canManage` per
 * row and `myRegion` for the caller, because region matching is
 * case-insensitive and whitespace-tolerant (see backend utils/region.js) and
 * duplicating that in the client is how the two drift apart. These flags decide
 * which buttons render; the endpoints re-check regardless.
 */
function DeliveryStaffTablePage() {
  const { user } = useAuth();
  const isRegionScoped = user?.role === DELIVERY_ADMIN_ROLE;

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [myRegion, setMyRegion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/delivery-staff");
      setStaff(res.data.staff);
      if (res.data.myRegion !== undefined) setMyRegion(res.data.myRegion);
    } catch {
      toast.error("Failed to load delivery-staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // A delivery-admin never sends a region: the server takes it from their
      // own account, so the field isn't shown to them and isn't sent.
      await api.post("/delivery-staff", {
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email,
        password: form.password,
        area: form.area,
        ...(isRegionScoped ? {} : { region: form.region }),
      });
      toast.success("Delivery-staff account created");
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create delivery-staff"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Permanently delete this delivery-staff account? This cannot be undone.")) return;
    try {
      await api.delete(`/delivery-staff/${id}`);
      toast.success("Delivery-staff account deleted");
      setStaff((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete"));
    }
  };

  return (
    <div className="dash-body">
      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Delivery Staff</h2>
            {isRegionScoped && (
              <p style={{ color: "#666", fontSize: 14, margin: "4px 0 0" }}>
                All regions shown. You can add or remove staff in{" "}
                <strong>{myRegion || "your region"}</strong>.
              </p>
            )}
          </div>
          <button className="uh-btn uh-btn-primary uh-btn-sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close" : "Add delivery staff"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="uh-card" style={{ margin: "16px 0", display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                First name
                <input
                  value={form.firstname}
                  onChange={(e) => setForm({ ...form, firstname: e.target.value })}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={form.lastname}
                  onChange={(e) => setForm({ ...form, lastname: e.target.value })}
                  required
                />
              </label>
            </div>

            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                Area (optional)
                <input
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  placeholder="Bharatpur"
                />
              </label>

              {isRegionScoped ? (
                // Not an input: the server takes the region from the creating
                // admin, so offering a field would imply a choice that doesn't
                // exist.
                <div style={{ alignSelf: "end", color: "#666", fontSize: 14 }}>
                  Region: <strong>{myRegion || "your region"}</strong>
                </div>
              ) : (
                <label>
                  Region
                  <input
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    placeholder="Chitwan"
                    required
                  />
                </label>
              )}
            </div>

            <button className="uh-btn uh-btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </button>
          </form>
        )}

        {loading ? (
          <p className="loading">Loading...</p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Area</th>
                <th>Region</th>
                <th>Rating</th>
                <th>Online</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#888" }}>No delivery-staff found</td></tr>
              )}
              {staff.map((s) => {
                const mine = s.canManage !== false;
                return (
                  <tr key={s._id}>
                    <td>{s.firstname} {s.lastname}</td>
                    <td>{s.email}</td>
                    <td>{s.area || "—"}</td>
                    <td>{s.region || "—"}</td>
                    <td>{s.deliveryRating.count > 0 ? `★ ${s.deliveryRating.average.toFixed(1)} (${s.deliveryRating.count})` : "No reviews yet"}</td>
                    <td>{isOnline(s.lastSeenAt) ? "🟢 Online" : "⚪ Offline"}</td>
                    <td>
                      {mine ? (
                        <button className="delete-btn" onClick={() => handleDelete(s._id)}>Delete</button>
                      ) : (
                        <span style={{ color: "#999", fontSize: 13 }}>Outside your region</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default DeliveryStaffTablePage;
