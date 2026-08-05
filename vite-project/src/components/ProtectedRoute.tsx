import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser, getToken } from "../lib/useAuth";
import { landingPathFor } from "../lib/roles";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const user = getCurrentUser();
  const token = getToken();
  const location = useLocation();

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Send them somewhere they can actually use rather than a generic page —
    // a tracking admin bounced off /dashboard belongs on /admin/cctv.
    const target = landingPathFor(user.role);

    // If a role's landing page is itself guarded against that role, redirecting
    // there bounces straight back and React Router renders nothing at all — a
    // blank screen with no error. That's a routing misconfiguration, so say so
    // instead of looping, and fall back to a page every signed-in user can use.
    if (target === location.pathname) {
      console.error(
        `Routing misconfiguration: role "${user.role}" lands on "${target}" but that route excludes it.`
      );
      return <Navigate to="/home" replace />;
    }
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
