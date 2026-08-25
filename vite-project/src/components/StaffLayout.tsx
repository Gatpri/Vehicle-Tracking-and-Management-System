import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "../styles/theme.css";
import "../app_pages/AppPages.css";
import "./AppLayout.css";
import { useAuth } from "../lib/AuthContext";
import NotificationBell from "./NotificationBell";

// A minimal shell for delivery-staff — a field-worker role, not a back-office
// one, so this deliberately isn't AdminLayout (whose nav/styling are built
// for a multi-section admin panel a courier has no use for). Reuses
// AppLayout.css's al-nav/al-user/al-main classes rather than a new stylesheet.
function StaffLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="al-nav">
        <div className="al-nav-inner">
          <NavLink to="/staff/deliveries" className="al-logo">
            <span className="al-logo-mark">D</span>
            Delivery
          </NavLink>

          {/* No Home link: /home is customer-only, so it would bounce a
              delivery-staff member straight back here. The logo above returns
              to /staff/deliveries, this role's landing page. */}
          <nav className="al-links">
            <NavLink to="/staff/deliveries" end className={({ isActive }) => `al-link ${isActive ? "active" : ""}`}>
              My Deliveries
            </NavLink>
            <NavLink to="/staff/earnings" className={({ isActive }) => `al-link ${isActive ? "active" : ""}`}>
              My Earnings
            </NavLink>
          </nav>

          <div className="al-user">
            <NotificationBell />
            {user && <span className="al-user-name">{user.firstname}</span>}
            <button className="uh-btn uh-btn-outline uh-btn-sm" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="al-main">{children}</main>
    </div>
  );
}

export default StaffLayout;
