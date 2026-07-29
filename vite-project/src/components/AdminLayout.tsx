import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "../Admin_Authorization/styles/dashboard.css";
import "./AdminLayout.css";
import { useAuth } from "../lib/useAuth";

const NAV_LINKS = [
  { to: "/dashboard", label: "Users & Admins" },
  { to: "/admin/bookings", label: "Bookings" },
  { to: "/admin/workshops", label: "Workshops" },
  { to: "/admin/chat", label: "Chat" },
  { to: "/admin/cctv", label: "CCTV Log" },
  { to: "/admin/sos", label: "SOS Queue" },
  { to: "/admin/theft-reports", label: "Theft Reports" },
];

function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h3 className="logo">8th-Sem<span>-Project</span></h3>
        <div className="dash-header-right">
          <span className="welcome">
            {user?.firstname} &nbsp;
            {user && <span className={`role-badge role-${user.role}`}>{user.role}</span>}
          </span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </div>

      <nav className="admin-subnav">
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/dashboard"}
            className={({ isActive }) => `admin-subnav-link ${isActive ? "active" : ""}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      {children}
    </div>
  );
}

export default AdminLayout;
