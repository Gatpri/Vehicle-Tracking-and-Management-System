import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "../styles/theme.css";
import "../app_pages/AppPages.css";
import "./AppLayout.css";
import { useAuth } from "../lib/useAuth";

const NAV_LINKS = [
  { to: "/vehicles", label: "Vehicles" },
  { to: "/bookings", label: "Bookings" },
  { to: "/workshops", label: "Workshops" },
  { to: "/wallet", label: "Wallet" },
  { to: "/chat", label: "Chat" },
  { to: "/safety", label: "Safety" },
];

function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="al-nav">
        <div className="al-nav-inner">
          <NavLink to="/home" className="al-logo">
            <span className="al-logo-mark">V</span>
            VeriTrack
          </NavLink>

          <nav className="al-links">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `al-link ${isActive ? "active" : ""}`}
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/sos" className="al-sos-link">
              SOS
            </NavLink>
          </nav>

          <div className="al-user">
            {user && <span className="al-user-name">{user.firstname}</span>}
            <button className="uh-btn uh-btn-outline uh-btn-sm" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="al-main">{children}</main>
    </div>
  );
}

export default AppLayout;
