import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getCurrentUser, getToken } from "../lib/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const user = getCurrentUser();
  const token = getToken();

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

export default ProtectedRoute;
