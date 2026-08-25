// Single source of truth for how the session cookie is issued and cleared.
//
// The session token used to be returned in the login response body and kept in
// localStorage, which meant any XSS on the page could read it outright and the
// session survived indefinitely in the browser profile — a container rebuild
// wouldn't clear it. It now travels in an httpOnly cookie: the browser attaches
// it automatically and JavaScript cannot read it at all.
export const SESSION_COOKIE = "session";

// 24h, matching the JWT's own `expiresIn` — the cookie expiring earlier than
// the token would silently log people out while the token was still valid, and
// later would leave a dead cookie being sent on every request.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Secure is conditional: over plain http (docker on localhost, a LAN IP) a
// Secure cookie is dropped by the browser and nothing would ever authenticate.
// Set COOKIE_SECURE=true once the deployment is behind HTTPS.
const isSecure = process.env.COOKIE_SECURE === "true";

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isSecure,
  // "lax" still sends the cookie on top-level navigations back from Google's
  // OAuth redirect, which "strict" would strip — breaking the sign-in return
  // trip. Cross-site POSTs remain blocked, which is the CSRF-relevant part.
  sameSite: isSecure ? "none" : "lax",
  maxAge: MAX_AGE_MS,
  path: "/",
});

// Clearing must repeat the same attributes it was set with (minus maxAge) or
// the browser treats it as a different cookie and leaves the original in place.
export const clearSessionCookieOptions = () => {
  const { maxAge: _maxAge, ...rest } = sessionCookieOptions();
  return rest;
};
