import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { landingPathFor } from "../lib/roles";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, status } = useAuth();
  const location = useLocation();

  // The session is an httpOnly cookie, so identity is only known after
  // /api/me answers. Rendering a redirect during that window would throw
  // every signed-in user back to /signin on a page refresh.
  if (status === "loading") {
    return <div className="auth-loading">Loading…</div>;
  }

  if (status === "anonymous" || !user) {
    return <Navigate to="/signin" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Send them somewhere they can actually use rather than a generic page —
    // a tracking admin bounced off /dashboard belongs on /admin/cctv.
    const target = landingPathFor(user.role);

    // If a role's landing page is itself guarded against that role, redirecting
    // there bounces straight back and React Router renders nothing at all — a
    // blank screen with no error. That's a routing misconfiguration, so say so
    // instead of looping. The fallback is /signin, not /home: /home is
    // customer-only now, so sending a staff role there would just loop again.
    if (target === location.pathname) {
      console.error(
        `Routing misconfiguration: role "${user.role}" lands on "${target}" but that route excludes it.`
      );
      return <Navigate to="/signin" replace />;
    }
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
