import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import "../Admin_Authorization/styles/dashboard.css";
import "./AdminLayout.css";
import { useAuth } from "../lib/useAuth";
import {
  FULL_ADMIN_ROLES,
  TRACKING_ROLES,
  WORKSHOP_ROLES,
  CHAT_ROLES,
  ACCOUNTING_ROLES,
  WORKSHOP_ADMIN_ROLE,
  DELIVERY_ADMIN_ROLE,
  DELIVERY_MANAGE_ROLES,
  STAFF_LOCATION_VIEWER_ROLES,
} from "../lib/roles";
import TheftAlertOverlay from "./TheftAlertOverlay";
import NotificationBell from "./NotificationBell";

// `roles` mirrors each route's guard in App.tsx, so a link is only ever shown
// to someone the router would actually let through.
const NAV_LINKS = [
  { to: "/dashboard", label: "Users & Admins", roles: FULL_ADMIN_ROLES },
  { to: "/admin/bookings", label: "Bookings", roles: WORKSHOP_ROLES },
  { to: "/admin/workshops", label: "Workshops", roles: WORKSHOP_ROLES },
  { to: "/admin/deliveries", label: "Deliveries", roles: DELIVERY_MANAGE_ROLES },
  { to: "/admin/delivery-staff", label: "Delivery Staff", roles: [...FULL_ADMIN_ROLES, DELIVERY_ADMIN_ROLE] },
  { to: "/admin/staff-locations", label: "Live Locations", roles: STAFF_LOCATION_VIEWER_ROLES },
  { to: "/admin/chat", label: "Chat", roles: CHAT_ROLES },
  { to: "/admin/cctv", label: "CCTV Log", roles: TRACKING_ROLES },
  { to: "/admin/sos", label: "SOS Queue", roles: TRACKING_ROLES },
  { to: "/admin/theft-reports", label: "Theft Reports", roles: TRACKING_ROLES },
  { to: "/admin/withdrawals", label: "Withdrawals", roles: ACCOUNTING_ROLES },
  { to: "/admin/wallets", label: "Wallets", roles: ACCOUNTING_ROLES },
  // Rendered inside the dashboard rather than linking out to the customer-side
  // wallet page — a garage owner shouldn't leave the admin area to see what
  // they've earned.
  { to: "/admin/my-wallet", label: "My Earnings", roles: [WORKSHOP_ADMIN_ROLE] },
];

function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const links = NAV_LINKS.filter((link) => user && link.roles.includes(user.role));

  return (
    <div className="dashboard">
      <div className="dash-header">
        <h3 className="logo">8th-Sem<span>-Project</span></h3>
        <div className="dash-header-right">
          <NotificationBell />
          <span className="welcome">
            {user?.firstname} &nbsp;
            {user && <span className={`role-badge role-${user.role}`}>{user.role}</span>}
          </span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </div>

      {/* No Home link: /home is customer-only (CUSTOMER_ROLES in App.tsx), so
          for every role that reaches this layout the link would be bounced
          straight back here. The first nav link below is this role's own
          landing page — see landingPathFor in lib/roles.ts. */}
      <nav className="admin-subnav">
        {links.map((link) => (
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

      {/* An admin can own a vehicle too — the overlay filters to the logged-in
          owner, so it stays silent for everyone else's detections. */}
      <TheftAlertOverlay />
    </div>
  );
}

export default AdminLayout;
