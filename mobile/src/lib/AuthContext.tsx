import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import api from "./api";
import { loadToken, setToken, clearToken } from "./session";
import { disconnectSocket } from "./socket";

export interface CurrentUser {
  id?: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  permissions?: string[];
}

// "loading" is a real state here for the same reason it is on the web, though
// the cause differs: the web app cannot read its httpOnly cookie, while this
// app must first read the token out of the device keystore and then ask the
// server who it belongs to. Either way there is a window where the app does
// not yet know who the user is, and guards must wait it out rather than
// treating "not known yet" as "not signed in" — which would bounce every
// signed-in user to the login screen on every cold start.
type Status = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  user: CurrentUser | null;
  status: Status;
  isAuthenticated: boolean;
  /** Store a freshly issued token, then load the user it belongs to. */
  signIn: (token: string) => Promise<CurrentUser | null>;
  /** Re-read the session from the server. */
  refresh: () => Promise<CurrentUser | null>;
  /** Forget the token locally and drop the socket. */
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
      // A 401 is the normal "nobody is signed in" case, not an error. Drop the
      // stored token too: it is either expired or invalid, and keeping it
      // would mean retrying it on every request for nothing.
      await clearToken();
      setUser(null);
      setStatus("anonymous");
      return null;
    }
  }, []);

  const signIn = useCallback(
    async (token: string) => {
      // Persist before refreshing — the /me call reads the token back out of
      // the store through the axios interceptor, so writing it second would
      // send an unauthenticated request.
      await setToken(token);
      return refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      // The server has no cookie to clear for a native client, so this call is
      // not what ends the session — dropping the token below is. It is still
      // worth making so the backend sees the sign-out, and it must not be
      // allowed to block logout if it fails.
      await api.post("/logout");
    } catch {
      // Even if the call fails, drop local state — the user asked to leave.
    }
    await clearToken();
    // Without this the old socket stays connected in the previous user's
    // rooms and would keep delivering their notifications to the next login.
    disconnectSocket();
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    // Keystore first, then identity: api.ts reads the token synchronously via
    // getToken(), so it has to be in memory before the first request goes out.
    (async () => {
      const token = await loadToken();
      if (!token) {
        setStatus("anonymous");
        return;
      }
      await refresh();
    })();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        isAuthenticated: status === "authenticated",
        signIn,
        refresh,
        logout,
      }}
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
