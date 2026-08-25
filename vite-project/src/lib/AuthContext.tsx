import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import api from "./api";

export interface CurrentUser {
  id?: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  permissions?: string[];
}

// "loading" is a real state, not a detail to paper over: the session lives in
// an httpOnly cookie the page cannot read, so on every fresh load there is a
// window where the app genuinely does not yet know who the user is. Guards
// must wait it out rather than treating "not known yet" as "not signed in",
// which would bounce every authenticated user to /signin on refresh.
type Status = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  user: CurrentUser | null;
  status: Status;
  isAuthenticated: boolean;
  /** Re-read the session from the server (call after login). */
  refresh: () => Promise<CurrentUser | null>;
  /** Clear the server-side cookie and local state. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const refresh = useCallback(async (): Promise<CurrentUser | null> => {
    try {
      const res = await api.get("/me");
      const nextUser: CurrentUser = res.data.user;
      setUser(nextUser);
      setStatus("authenticated");
      return nextUser;
    } catch {
      // A 401 here is the normal "nobody is signed in" case, not an error.
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Only the server can remove an httpOnly cookie, so logout is a request
      // now rather than a localStorage.removeItem call.
      await api.post("/logout");
    } catch {
      // Even if the call fails, drop local state — the user asked to leave.
    }
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{ user, status, isAuthenticated: status === "authenticated", refresh, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
