import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";

/**
 * Firebase, used only to turn a Google ID token into a *Firebase* ID token.
 *
 * That indirection is not optional: backend_api/routes/google_auth_signup.js
 * verifies the token with firebase-admin's verifyIdToken, which only accepts
 * tokens Firebase itself issued. Sending Google's own ID token straight to
 * that endpoint fails verification, so the native flow mirrors what the web
 * app's signInWithPopup did behind the scenes — authenticate with Google, hand
 * the result to Firebase, then send Firebase's token to our backend.
 *
 * Config comes from EXPO_PUBLIC_* environment variables, the Expo equivalent
 * of the web app's VITE_* ones. These are public by design (they identify the
 * project, they do not authorise anything), exactly as in the web client.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** True when the app has been given enough config to attempt Google sign-in. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// getApps() guards against re-initialising during Fast Refresh, which throws.
// Captured before initializeApp, because afterwards it is always non-empty.
const alreadyInitialised = getApps().length > 0;
const app = alreadyInitialised ? getApp() : initializeApp(firebaseConfig);

/**
 * In-memory persistence, declared rather than defaulted into.
 *
 * On React Native getAuth() warns that the session will not survive an app
 * restart and points at AsyncStorage. That is the right default for an app
 * whose session *is* the Firebase one — but not this one: as above, Firebase
 * only converts a Google token into a Firebase token, and the session the app
 * actually runs on is the backend JWT in the device keystore. Persisting the
 * Firebase session would leave a second, longer-lived credential on the device
 * that nothing reads and logout would not clear.
 *
 * So the warning describes exactly what we want. Saying so through
 * initializeAuth makes that choice explicit — and silences a warning that
 * would otherwise train everyone to ignore the log.
 *
 * Fast Refresh can re-run this module after auth is already initialised, and
 * initializeAuth throws on a second call; getAuth returns the existing
 * instance in that case.
 */
export const auth = alreadyInitialised
  ? getAuth(app)
  : initializeAuth(app, { persistence: inMemoryPersistence });

/**
 * Exchange a Google ID token for a Firebase ID token.
 *
 * Note this deliberately does not persist a Firebase session. The app's own
 * session is the backend JWT in the device keystore; Firebase is a one-shot
 * step in the sign-in handshake and nothing else in the app reads from it.
 */
export const firebaseTokenFromGoogle = async (googleIdToken: string): Promise<string> => {
  const credential = GoogleAuthProvider.credential(googleIdToken);
  const result = await signInWithCredential(auth, credential);
  return result.user.getIdToken();
};
