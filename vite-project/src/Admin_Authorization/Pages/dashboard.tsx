import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";
import "../styles/dashboard.css";

interface User {
  _id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
}

function Dashboard() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  const currentUser: User | null = stored ? JSON.parse(stored) : null;
  const token = localStorage.getItem("token");

  const [users, setUsers] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error('[Dashboard] No user or token found');
      navigate("/login");
      return;
    }
  }, [currentUser, token, navigate]);

  useEffect(() => {
    if (!token) {
      console.error('[Dashboard] No token available');
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    const load = async () => {
      try {
        console.log('[Dashboard] Loading users...');
        const usersRes = await axios.get("http://localhost:3000/users", { headers });
        setUsers(usersRes.data.users);
        console.log('[Dashboard] Users loaded:', usersRes.data.users.length);
      } catch (err) {
        console.error('[Dashboard] Failed to load users:', err);
        toast.error("Failed to load users");
      }

      if (currentUser?.role === "superadmin" || currentUser?.role === "admin") {
        try {
          console.log('[Dashboard] Loading admins...');
          const adminsRes = await axios.get("http://localhost:3000/admins", { headers });
          setAdmins(adminsRes.data.admins);
          console.log('[Dashboard] Admins loaded:', adminsRes.data.admins.length);
        } catch (err) {
          console.error('[Dashboard] Failed to load admins:', err);
          toast.error("Failed to load admins");
        }
      }

      setLoading(false);
    };

    load();
  }, [token, currentUser?.role]);

  const handleDeleteUser = async (id: string) => {
    if (!token) return;
    try {
      await axios.delete(`http://localhost:3000/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      console.error('[Dashboard] Failed to delete user:', err);
      toast.error("Failed to delete user");
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!token) return;
    try {
      await axios.delete(`http://localhost:3000/admins/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Admin deleted");
      setAdmins((prev) => prev.filter((a) => a._id !== id));
    } catch {
      toast.error("Failed to delete admin");
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
      const res = await axios.post(
        "http://localhost:3000/admins",
        { firstname: adminFirstname, lastname: adminLastname, email: adminEmail, password: adminPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Admin created");
      setAdmins((prev) => [...prev, res.data.user]);
      setAdminFirstname(""); setAdminLastname(""); setAdminEmail(""); setAdminPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create admin");
    }
  };

  // handlePromote function added
  const handlePromote = async (id: string, role: string) => {
    if (!token) return;
    try {
      const res = await axios.patch(
        `http://localhost:3000/users/${id}/promote`,
        { role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(res.data.message);

      if (role === "admin") {
        const promoted = users.find((u) => u._id === id);
        if (promoted) {
          setUsers((prev) => prev.filter((u) => u._id !== id));
          setAdmins((prev) => [...prev, { ...promoted, role: "admin" }]);
        }
      }

      if (role === "superadmin") {
        setAdmins((prev) => prev.filter((a) => a._id !== id));
      }

    } catch (err: any) {
       console.log("FULL ERROR:", err.response);
      toast.error(err?.response?.data?.message || "Failed to promote");
    }
  };

  if (!currentUser) return null;
  if (loading) return <p className="loading">Loading...</p>;

  return (
      <div className="dash-body">

        {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
          <div className="section">
            <h2>Users</h2>
            <form className="add-form" onSubmit={handleAddUser}>
              <input placeholder="First name" value={newFirstname} onChange={(e) => setNewFirstname(e.target.value)} required />
              <input placeholder="Last name"  value={newLastname}  onChange={(e) => setNewLastname(e.target.value)}  required />
              <input placeholder="Email"      value={newEmail}     onChange={(e) => setNewEmail(e.target.value)}     required type="email" />
              <input placeholder="Password"   value={newPassword}  onChange={(e) => setNewPassword(e.target.value)}  required type="password" />
              <button type="submit" className="add-btn">+ Add User</button>
            </form>
            <table className="dash-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th><th>Promote</th></tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>No users found</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.firstname} {u.lastname}</td>
                    <td>{u.email}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td><button className="delete-btn" onClick={() => handleDeleteUser(u._id)}>Delete</button></td>
                
                    <td>
                      <button className="promote-btn" onClick={() => handlePromote(u._id, "admin")}>
                        → Admin
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
          <div className="section">
            <h2>Admins</h2>
            <form className="add-form" onSubmit={handleAddAdmin}>
              <input placeholder="First name" value={adminFirstname} onChange={(e) => setAdminFirstname(e.target.value)} required />
              <input placeholder="Last name"  value={adminLastname}  onChange={(e) => setAdminLastname(e.target.value)}  required />
              <input placeholder="Email"      value={adminEmail}     onChange={(e) => setAdminEmail(e.target.value)}     required type="email" />
              <input placeholder="Password"   value={adminPassword}  onChange={(e) => setAdminPassword(e.target.value)}  required type="password" />
              <button type="submit" className="add-btn">+ Add Admin</button>
            </form>
            <table className="dash-table">
              <thead>
              
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th><th>Promote</th></tr>
              </thead>
              <tbody>
                {admins.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", color: "#888" }}>No admins found</td></tr>
                )}
                {admins.map((a) => (
                  <tr key={a._id}>
                    <td>{a.firstname} {a.lastname}</td>
                    <td>{a.email}</td>
                    <td><span className={`role-badge role-${a.role}`}>{a.role}</span></td>
                    {currentUser.role === "superadmin" && (
                      <td><button className="delete-btn" onClick={() => handleDeleteAdmin(a._id)}>Delete</button></td>
                    )}
                    <td>
                      {currentUser.role === "superadmin" && (
                        <button className="promote-btn" onClick={() => handlePromote(a._id, "superadmin")}>
                          → Superadmin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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


   