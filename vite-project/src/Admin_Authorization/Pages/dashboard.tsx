import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
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

const ALL_ROLE_TABLES = [
  "superadmin",
  "admin",
  "vehicle-tracking-admin",
  "workshop-admin",
  "accounting-admin",
  "delivery-admin",
];

// Which role tables each viewer sees at all. Superadmin sees everything;
// admin sees everything below superadmin (superadmins are hidden outright,
// not merely un-actionable); the narrowed roles see only their own peer
// table, which is what makes their dashboard a roster rather than a control
// panel. Anyone absent here gets no role tables.
const VISIBLE_ROLE_TABLES: Record<string, string[]> = {
  superadmin: ALL_ROLE_TABLES,
  admin: ALL_ROLE_TABLES.filter((r) => r !== "superadmin"),
  "vehicle-tracking-admin": ["vehicle-tracking-admin"],
  "delivery-admin": ["delivery-admin"],
};

// Confirmed delete matrix: nobody deletes a superadmin except another
// superadmin (and superadmin never appears with a delete button here at all
// — self-service superadmin deletion isn't offered anywhere in this UI).
// Superadmin deletes any other role. Admin has the same reach as superadmin
// one tier down: every admin-tier account (peer admins, tracking/workshop/
// accounting/delivery-admins) AND delivery-staff, but never a superadmin.
// The narrowed roles delete nothing here — vehicle-tracking-admin and
// delivery-admin get a read-only roster of their peers.
function canDeleteAdminTier(viewerRole: string, targetRole: string): boolean {
  if (targetRole === "superadmin") return false;
  if (viewerRole === "superadmin") return true;
  if (viewerRole === "admin") return true;
  return false;
}

// Only the two full admins run the user-administration side of this page:
// the create forms, the Users table and its promote buttons.
function isFullAdminRole(role: string): boolean {
  return role === "superadmin" || role === "admin";
}

// Which roles each viewer may create outright. Mirrors ASSIGNABLE_ROLES in
// protectedRoutes.js — the server rejects anything not permitted there, so this
// only decides which forms are worth showing.
const CREATABLE_ROLES: Record<string, string[]> = {
  superadmin: [
    "superadmin",
    "admin",
    "vehicle-tracking-admin",
    "workshop-admin",
    "accounting-admin",
    "delivery-admin",
    "delivery-staff",
  ],
  admin: [
    "admin",
    "vehicle-tracking-admin",
    "workshop-admin",
    "accounting-admin",
    "delivery-admin",
    "delivery-staff",
  ],
};

// Fixed top-to-bottom order of the role sections, highest privilege first.
// Includes delivery-staff, which has a create form and its own richer table
// even though it isn't one of the generic RoleTable roles.
const SECTION_ORDER = [
  "superadmin",
  "admin",
  "vehicle-tracking-admin",
  "workshop-admin",
  "accounting-admin",
  "delivery-admin",
  "delivery-staff",
];

// Singular label for the "Create X" heading and button, since ROLE_LABELS is
// plural for table headings.
const ROLE_SINGULAR: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  "vehicle-tracking-admin": "Vehicle-Tracking Admin",
  "workshop-admin": "Workshop Admin",
  "accounting-admin": "Accounting Admin",
  "delivery-admin": "Delivery Admin",
  "delivery-staff": "Delivery Staff",
};

// Case-insensitive match across the columns a person would actually search by.
function matchesSearch(u: User, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [u.firstname, u.lastname, `${u.firstname} ${u.lastname}`, u.email, u.role, u.area, u.region]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
}

// One create form per role the viewer is allowed to create. Region/area inputs
// appear only for the roles that are scoped by them — a delivery-admin without
// a region manages nobody, and the server rejects that outright.
function CreateAccountForm({
  role,
  onCreated,
}: {
  role: string;
  onCreated: () => void;
}) {
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [area, setArea] = useState("");
  const [region, setRegion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsRegion = role === "delivery-admin" || role === "delivery-staff";
  const needsArea = role === "delivery-staff";
  const label = ROLE_SINGULAR[role] ?? role;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admins", {
        firstname,
        lastname,
        email,
        password,
        role,
        ...(needsArea ? { area } : {}),
        ...(needsRegion ? { region } : {}),
      });
      toast.success(`${label} created`);
      setFirstname(""); setLastname(""); setEmail(""); setPassword(""); setArea(""); setRegion("");
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Failed to create ${label}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="section">
      <h2>Create {label}</h2>
      <form className="add-form" onSubmit={handleSubmit}>
        <input placeholder="First name" value={firstname} onChange={(e) => setFirstname(e.target.value)} required />
        <input placeholder="Last name" value={lastname} onChange={(e) => setLastname(e.target.value)} required />
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required type="email" />
        <input placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required type="password" minLength={8} />
        {needsArea && (
          <input placeholder="Area (e.g. Bharatpur)" value={area} onChange={(e) => setArea(e.target.value)} required />
        )}
        {needsRegion && (
          <input
            placeholder="Region (e.g. Chitwan)"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            required={role === "delivery-admin"}
          />
        )}
        <button type="submit" className="add-btn" disabled={submitting}>
          {submitting ? "Creating..." : `+ Add ${label}`}
        </button>
      </form>
    </div>
  );
}

// One table per admin-tier role, all fed by the same generic endpoint so
// adding a role means adding one entry to ROLE_ORDER, not a new fetch/table
// pair each time.
function RoleTable({
  role,
  currentUser,
  refreshKey = 0,
}: {
  role: string;
  // Only the viewer's role is consulted here (for the promote/delete
  // columns), so this takes the narrow shape /api/me returns rather than the
  // full User record used for table rows.
  currentUser: { role: string };
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/users/by-role?role=${role}`);
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
  }, [role, refreshKey]);

  const handleDelete = async (id: string) => {
    // Every non-"user" role here is managed through /admins/:id — the
    // endpoint's own superadmin-target guard is the final backstop even if
    // the UI's canDeleteAdminTier check were ever wrong.
    try {
      await api.delete(`/admins/${id}`);
      toast.success("Deleted");
      setRows((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete");
    }
  };

  const promoteToSuperadmin = async (id: string) => {
    try {
      const res = await api.patch(`/users/${id}/promote`, { role: "superadmin" });
      toast.success(res.data.message);
      setRows((prev) => prev.filter((r) => r._id !== id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to promote");
    }
  };

  // Promote-to-superadmin is superadmin's alone; a plain admin managing peer
  // admins must not be able to mint someone above themselves.
  const showPromoteColumn = role === "admin" && currentUser.role === "superadmin";
  const visibleRows = rows.filter((r) => matchesSearch(r, search));
  const columnCount = showPromoteColumn ? 5 : 4;

  return (
    <div className="section">
      <h2>{ROLE_LABELS[role] ?? role}</h2>
      <input
        className="table-search"
        placeholder={`Search ${ROLE_LABELS[role] ?? role}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <p className="loading">Loading...</p>
      ) : (
        <table className="dash-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th>{showPromoteColumn && <th>Promote</th>}</tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr><td colSpan={columnCount} style={{ textAlign: "center", color: "#888" }}>
                {rows.length === 0 ? "None found" : "No matches"}
              </td></tr>
            )}
            {visibleRows.map((r) => (
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
                {showPromoteColumn && (
                  <td>
                    <button className="promote-btn" onClick={() => promoteToSuperadmin(r._id)}>→ Superadmin</button>
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
  // Identity comes from the server via /api/me, not a localStorage blob the
  // user could edit to hand themselves a role they don't have.
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userSearch, setUserSearch] = useState("");

  const [newFirstname, setNewFirstname] = useState("");
  const [newLastname, setNewLastname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Bumped after any account is created so every RoleTable refetches — a new
  // accounting-admin has to appear in the Accounting Admins table without a
  // manual page reload.
  const [refreshKey, setRefreshKey] = useState(0);

  // ProtectedRoute already gates this page on a valid admin session; this
  // only covers the session expiring while the tab is open.
  useEffect(() => {
    if (!currentUser) {
      navigate("/login");
    }
  }, [currentUser, navigate]);

  const loadUsers = async () => {
    if (!currentUser) return;
    setLoadingUsers(true);
    try {
      const res = await api.get("/users");
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
  }, [currentUser]);

  const handleDeleteUser = async (id: string) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/users", {
        firstname: newFirstname,
        lastname: newLastname,
        email: newEmail,
        password: newPassword,
      });
      toast.success("User created");
      setUsers((prev) => [...prev, res.data.user]);
      setNewFirstname(""); setNewLastname(""); setNewEmail(""); setNewPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create user");
    }
  };

  const handlePromote = async (id: string, role: string, extra?: { area?: string; region?: string }) => {
    try {
      const res = await api.patch(`/users/${id}/promote`, { role, ...extra });
      toast.success(res.data.message);
      setUsers((prev) => prev.filter((u) => u._id !== id));
      // The promoted account moves out of Users and into its new role's table.
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to promote");
    }
  };

  if (!currentUser) return null;

  const isFullAdmin = isFullAdminRole(currentUser.role);
  const roleTables = VISIBLE_ROLE_TABLES[currentUser.role] ?? [];
  const creatableRoles = CREATABLE_ROLES[currentUser.role] ?? [];
  const visibleUsers = users.filter((u) => matchesSearch(u, userSearch));

  // Delivery-staff's roster isn't a generic RoleTable (it has its own richer
  // component), so it never appears in roleTables — it's included here
  // explicitly for the roles that are allowed to see it.
  const seesDeliveryStaff = isFullAdmin || currentUser.role === "delivery-admin";

  // Ordered union of the roles this viewer can create and the ones they can
  // see, so a role with only a form (or only a table) still gets its section.
  // SECTION_ORDER drives the order rather than either source list, keeping the
  // page stable regardless of who's looking.
  const roleSections = SECTION_ORDER.filter(
    (role) =>
      creatableRoles.includes(role) ||
      roleTables.includes(role) ||
      (role === "delivery-staff" && seesDeliveryStaff),
  );

  return (
    <div className="dash-body">
      {isFullAdmin && (
        <div className="section">
          <h2>Create Users</h2>
          <form className="add-form" onSubmit={handleAddUser}>
            <input placeholder="First name" value={newFirstname} onChange={(e) => setNewFirstname(e.target.value)} required />
            <input placeholder="Last name" value={newLastname} onChange={(e) => setNewLastname(e.target.value)} required />
            <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required type="email" />
            <input placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required type="password" minLength={8} />
            <button type="submit" className="add-btn">+ Add User</button>
          </form>
        </div>
      )}

      {isFullAdmin && (
        <div className="section">
          <h2>Users</h2>
          <input
            className="table-search"
            placeholder="Search Users..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
          <table className="dash-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th><th>Promote</th></tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>Loading...</td></tr>
              ) : visibleUsers.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>
                  {users.length === 0 ? "No users found" : "No matches"}
                </td></tr>
              ) : (
                visibleUsers.map((u) => (
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

      {/* Each role is one unit: its create form immediately followed by its
          table, mirroring the Create Users / Users pairing above, rather than
          every form stacked at the top and every table below. A role appears
          here if the viewer can create it, see it, or both. */}
      {roleSections.map((role) => (
        <div key={role}>
          {creatableRoles.includes(role) && (
            <CreateAccountForm
              role={role}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          )}
          {roleTables.includes(role) && (
            <RoleTable
              role={role}
              currentUser={currentUser}
              refreshKey={refreshKey}
            />
          )}
          {/* Delivery-staff's roster is the richer table (rating/region/online
              status) rather than the generic RoleTable — same component
              delivery-admin's own landing page uses. The backend region-scopes
              its rows for delivery-admin. */}
          {role === "delivery-staff" && seesDeliveryStaff && <DeliveryStaffTablePage />}
        </div>
      ))}

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
