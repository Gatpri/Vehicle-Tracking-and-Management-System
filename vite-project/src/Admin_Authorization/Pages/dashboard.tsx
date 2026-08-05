import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import "../styles/dashboard.css";
import DeliveryStaffTablePage from "../../admin_pages/DeliveryStaffTablePage";

interface User {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  area?: string;
  region?: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmins",
  admin: "Admins",
  "vehicle-tracking-admin": "Vehicle-Tracking Admins",
  "workshop-admin": "Workshop Admins",
  "accounting-admin": "Accounting Admins",
  "delivery-admin": "Delivery Admins",
};

// Confirmed delete matrix: nobody deletes a superadmin except another
// superadmin (and superadmin never appears with a delete button here at all
// — self-service superadmin deletion isn't offered anywhere in this UI).
// Superadmin deletes any other role. Admin has the same reach as superadmin
// one tier down: every admin-tier account (peer admins, tracking/workshop/
// accounting/delivery-admins) AND delivery-staff, but never a superadmin.
function canDeleteAdminTier(viewerRole: string, targetRole: string): boolean {
  if (targetRole === "superadmin") return false;
  if (viewerRole === "superadmin") return true;
  if (viewerRole === "admin") return true;
  return false;
}

// One table per admin-tier role, all fed by the same generic endpoint so
// adding a role means adding one entry to ROLE_ORDER, not a new fetch/table
// pair each time.
function RoleTable({ role, currentUser, token }: { role: string; currentUser: User; token: string }) {
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:3000/users/by-role?role=${role}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(res.data.users);
    } catch {
      toast.error(`Failed to load ${ROLE_LABELS[role] ?? role}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const handleDelete = async (id: string) => {
    // Every non-"user" role here is managed through /admins/:id — the
    // endpoint's own superadmin-target guard is the final backstop even if
    // the UI's canDeleteAdminTier check were ever wrong.
    try {
      await axios.delete(`http://localhost:3000/admins/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("Deleted");
      setRows((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete");
    }
  };

  const promoteToSuperadmin = async (id: string) => {
    try {
      const res = await axios.patch(
        `http://localhost:3000/users/${id}/promote`,
        { role: "superadmin" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data.message);
      setRows((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to promote");
    }
  };

  return (
    <div className="section">
      <h2>{ROLE_LABELS[role] ?? role}</h2>
      {loading ? (
        <p className="loading">Loading...</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th>{role === "admin" && <th>Promote</th>}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={role === "admin" ? 5 : 4} style={{ textAlign: "center", color: "#888" }}>None found</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.firstname} {r.lastname}</td>
                <td>{r.email}</td>
                <td>
                  <span className={`role-badge role-${r.role}`}>{r.role}</span>
                  {r.role === "delivery-admin" && r.region && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: "#888" }}>({r.region})</span>
                  )}
                </td>
                <td>
                  {canDeleteAdminTier(currentUser.role, r.role) && (
                    <button className="delete-btn" onClick={() => handleDelete(r._id)}>Delete</button>
                  )}
                </td>
                {role === "admin" && (
                  <td>
                    {currentUser.role === "superadmin" && (
                      <button className="promote-btn" onClick={() => promoteToSuperadmin(r._id)}>→ Superadmin</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  const currentUser: User | null = stored ? JSON.parse(stored) : null;
  const token = localStorage.getItem("token");

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [newFirstname, setNewFirstname] = useState("");
  const [newLastname, setNewLastname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [adminFirstname, setAdminFirstname] = useState("");
  const [adminLastname, setAdminLastname] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  useEffect(() => {
    if (!currentUser || !token) {
      navigate("/login");
    }
  }, [currentUser, token, navigate]);

  const loadUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const res = await axios.get("http://localhost:3000/users", { headers: { Authorization: `Bearer ${token}` } });
      setUsers(res.data.users);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleDeleteUser = async (id: string) => {
    if (!token) return;
    try {
      await axios.delete(`http://localhost:3000/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await axios.post(
        "http://localhost:3000/users",
        { firstname: newFirstname, lastname: newLastname, email: newEmail, password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("User created");
      setUsers((prev) => [...prev, res.data.user]);
      setNewFirstname(""); setNewLastname(""); setNewEmail(""); setNewPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create user");
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await axios.post(
        "http://localhost:3000/admins",
        { firstname: adminFirstname, lastname: adminLastname, email: adminEmail, password: adminPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Admin created");
      setAdminFirstname(""); setAdminLastname(""); setAdminEmail(""); setAdminPassword("");
      // The new admin lands in the Admins RoleTable, which fetches
      // independently — no local list here to append to.
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create admin");
    }
  };

  const handlePromote = async (id: string, role: string, extra?: { area?: string; region?: string }) => {
    if (!token) return;
    try {
      const res = await axios.patch(
        `http://localhost:3000/users/${id}/promote`,
        { role, ...extra },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data.message);
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to promote");
    }
  };

  if (!currentUser) return null;

  // delivery-admin's own dashboard (if ever routed here) shows only their
  // region's delivery-staff — their actual landing page is
  // /admin/delivery-staff via AdminLayout, not this route, but this is cheap
  // insurance against a routing change later.
  if (currentUser.role === "delivery-admin") {
    return <DeliveryStaffTablePage />;
  }

  const isFullAdmin = currentUser.role === "superadmin" || currentUser.role === "admin";
  const ROLE_ORDER = ["superadmin", "admin", "vehicle-tracking-admin", "workshop-admin", "accounting-admin", "delivery-admin"];

  return (
    <div className="dash-body">
      {isFullAdmin && (
        <div className="section">
          <h2>Users</h2>
          <form className="add-form" onSubmit={handleAddUser}>
            <input placeholder="First name" value={newFirstname} onChange={(e) => setNewFirstname(e.target.value)} required />
            <input placeholder="Last name" value={newLastname} onChange={(e) => setNewLastname(e.target.value)} required />
            <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required type="email" />
            <input placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required type="password" />
            <button type="submit" className="add-btn">+ Add User</button>
          </form>
          <table className="dash-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th><th>Promote</th></tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>No users found</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.firstname} {u.lastname}</td>
                    <td>{u.email}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td><button className="delete-btn" onClick={() => handleDeleteUser(u._id)}>Delete</button></td>
                    <td>
                      <button className="promote-btn" onClick={() => handlePromote(u._id, "admin")}>→ Admin</button>
                      <button
                        className="promote-btn"
                        style={{ marginLeft: 6 }}
                        title="CCTV, SOS, theft reports and chat only — no user administration, bookings or workshops"
                        onClick={() => handlePromote(u._id, "vehicle-tracking-admin")}
                      >
                        → Tracking Admin
                      </button>
                      <button
                        className="promote-btn"
                        style={{ marginLeft: 6 }}
                        title="Runs one garage: its bookings, details and customers. Assign the workshop itself from the Workshops page."
                        onClick={() => handlePromote(u._id, "workshop-admin")}
                      >
                        → Workshop Admin
                      </button>
                      <button
                        className="promote-btn"
                        style={{ marginLeft: 6 }}
                        title="Reviews withdrawal requests and pays them out of the company eSewa account. No bookings, workshops or user administration."
                        onClick={() => handlePromote(u._id, "accounting-admin")}
                      >
                        → Accounting Admin
                      </button>
                      <button
                        className="promote-btn"
                        style={{ marginLeft: 6 }}
                        title="Region-scoped manager for delivery-staff: assigns deliveries, views live location/ratings, can remove delivery-staff accounts in their region."
                        onClick={() => {
                          const region = window.prompt("Which region does this delivery-admin manage? (e.g. Chitwan)");
                          if (region && region.trim()) handlePromote(u._id, "delivery-admin", { region: region.trim() });
                        }}
                      >
                        → Delivery Admin
                      </button>
                      <button
                        className="promote-btn"
                        style={{ marginLeft: 6 }}
                        title="Picks up and drops off customers' vehicles for workshop servicing in a specific area/region."
                        onClick={() => {
                          const area = window.prompt("Which area does this delivery-staff member cover? (e.g. Bharatpur)");
                          if (!area || !area.trim()) return;
                          const region = window.prompt("Which region is that area part of? (e.g. Chitwan)");
                          if (region && region.trim()) {
                            handlePromote(u._id, "delivery-staff", { area: area.trim(), region: region.trim() });
                          } else {
                            handlePromote(u._id, "delivery-staff", { area: area.trim() });
                          }
                        }}
                      >
                        → Delivery Staff
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {isFullAdmin && (
        <div className="section">
          <h2>Create Admin</h2>
          <form className="add-form" onSubmit={handleAddAdmin}>
            <input placeholder="First name" value={adminFirstname} onChange={(e) => setAdminFirstname(e.target.value)} required />
            <input placeholder="Last name" value={adminLastname} onChange={(e) => setAdminLastname(e.target.value)} required />
            <input placeholder="Email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required type="email" />
            <input placeholder="Password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required type="password" />
            <button type="submit" className="add-btn">+ Add Admin</button>
          </form>
        </div>
      )}

      {isFullAdmin && token && ROLE_ORDER.map((role) => (
        <RoleTable key={role} role={role} currentUser={currentUser} token={token} />
      ))}

      {/* Delivery-staff gets the richer table (rating/region/online status)
          rather than the generic RoleTable, same component delivery-admin's
          own landing page uses. */}
      {isFullAdmin && <DeliveryStaffTablePage />}

      {currentUser.role === "user" && (
        <div className="section profile-card">
          <h2>My Profile</h2>
          <p><span>Name:</span> {currentUser.firstname}</p>
          <p><span>Email:</span> {currentUser.email}</p>
          <p><span>Role:</span> <span className="role-badge role-user">user</span></p>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
