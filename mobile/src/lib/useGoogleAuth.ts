import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import api, { getErrorMessage } from "./api";
import { firebaseTokenFromGoogle, isFirebaseConfigured } from "./firebase";

// Closes the auth browser and returns control to the app once Google
// redirects back. Required by expo-auth-session and must run at module scope.
WebBrowser.maybeCompleteAuthSession();

export interface GoogleAuth {
  signIn: () => Promise<void>;
  busy: boolean;
  error: string | null;
  available: boolean;
}

/**
 * Whether Google sign-in can work at all on this device.
 *
 * Read before any hook runs, because expo-auth-session throws *during render*
 * when the client ID for the current platform is missing:
 *
 *   Client Id property `iosClientId` must be defined to use Google auth
 *   on this platform.
 *
 * That is a hard crash of the login screen, not a disabled button — so the
 * real hook must not be mounted at all until the IDs exist. Empty strings
 * count as absent: a .env copied from the template has the keys present but
 * blank, which is the normal state before anyone has created OAuth clients.
 */
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;

const platformClientId = Platform.select({
  android: androidClientId,
  ios: iosClientId,
  default: webClientId,
});

// Google.useIdTokenAuthRequest falls back to `clientId` when the
// platform-specific one is absent, so either satisfies it.
export const GOOGLE_CONFIGURED =
  isFirebaseConfigured && Boolean(platformClientId || webClientId);

/**
 * Google sign-in for the native app.
 *
 * The web app used Firebase's signInWithPopup, which needs a browser window
 * and does not exist on React Native. The native equivalent is an OAuth
 * redirect through the system browser, which is what expo-auth-session does.
 *
 * The flow, once the client IDs are in place:
 *
 *   1. expo-auth-session opens Google's consent screen and comes back with a
 *      Google ID token.
 *   2. That is exchanged for a Firebase ID token (see firebase.ts) — the
 *      backend verifies with firebase-admin and accepts nothing else.
 *   3. The Firebase token goes to POST /google-auth, which returns the app's
 *      own session token because this client sends the x-client header.
 *
 * **Only call this when GOOGLE_CONFIGURED is true.** It is unsafe otherwise,
 * for the reason described above. Callers should use the exported constant to
 * decide whether to render a component that uses this hook — see
 * components/GoogleSignInButton.tsx, which exists precisely to keep that
 * decision outside of any component that must always render.
 */
export function useGoogleAuth(onToken: (sessionToken: string) => Promise<unknown>): GoogleAuth {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId,
    iosClientId,
    // The web client ID doubles as the audience Firebase expects, so it is
    // supplied even on a device build.
    clientId: webClientId,
  });

  useEffect(() => {
    if (response?.type !== "success") {
      // "dismiss" and "cancel" are the user backing out, which is not an error
      // worth showing them.
      if (response?.type === "error") {
        setError(response.error?.message || "Google sign-in failed.");
        setBusy(false);
      }
      return;
    }

    const googleIdToken = response.params?.id_token;
    if (!googleIdToken) {
      setError("Google did not return an ID token.");
      setBusy(false);
      return;
    }

    (async () => {
      try {
        const firebaseToken = await firebaseTokenFromGoogle(googleIdToken);
        const res = await api.post("/google-auth", { idToken: firebaseToken });
        if (res.data.success && res.data.token) {
          await onToken(res.data.token);
          return;
        }
        setError(res.data.message || "The server did not return a session token.");
      } catch (err) {
        setError(getErrorMessage(err, "Could not complete Google sign-in."));
      } finally {
        setBusy(false);
      }
    })();
    // onToken is a new closure each render; depending on it would re-run this
    // effect and re-submit the same token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await promptAsync();
    } catch (err) {
      setError(getErrorMessage(err, "Could not open Google sign-in."));
      setBusy(false);
    }
  };

  return { signIn, busy, error, available: Boolean(request) };
}
