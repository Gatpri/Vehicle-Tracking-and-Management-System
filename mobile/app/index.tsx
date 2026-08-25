import { Redirect } from "expo-router";
import { useAuth } from "../src/lib/AuthContext";
import { landingPathFor } from "../src/lib/roles";
import { Loading } from "../src/components/ui";

/**
 * The entry route. Nothing renders here — it only decides where to send
 * someone on a cold start, once the keystore read and the /me call have
 * settled.
 *
 * Without this, "/" matches no file and expo-router shows its unmatched-route
 * screen instead of the app.
 */
export default function Index() {
  const { status, user } = useAuth();

  // Redirecting during "loading" would send every returning user to the login
  // screen before the session has even been read — the same trap the root
  // layout's guard avoids.
  if (status === "loading") return <Loading label="Signing you in…" />;
  if (status === "anonymous") return <Redirect href="/login" />;

  return <Redirect href={landingPathFor(user?.role) as never} />;
}
