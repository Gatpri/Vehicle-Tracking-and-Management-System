import { useNavigate } from "react-router-dom";

export interface CurrentUser {
  _id?: string;
  id?: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
}

export const getCurrentUser = (): CurrentUser | null => {
  const stored = localStorage.getItem("user");
  return stored ? JSON.parse(stored) : null;
};

export const getToken = (): string | null => localStorage.getItem("token");

export const useAuth = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const token = getToken();

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  return { user, token, isAuthenticated: !!(user && token), logout };
};
