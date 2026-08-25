// Distinguishes the native app from a browser so each gets the session in the
// form it can actually use.
//
// This exists because the two clients have genuinely different constraints,
// not as a convenience toggle:
//
//   Browser — must keep using the httpOnly cookie. Echoing the token in the
//             response body as well would undo the reason the cookie exists:
//             page JavaScript (and therefore any XSS) could read it again.
//   Native  — has no cookie jar bound to an origin, so it cannot use the
//             cookie at all. It needs the token in the body once, at login,
//             to put in the device keystore.
//
// The app announces itself with a header. That is safe here because the header
// only ever ADDS the token to a response for a request that already
// authenticated successfully — it grants nothing on its own, and a browser
// that never sends the header keeps the strict cookie-only behaviour.
export const CLIENT_HEADER = "x-client";
export const NATIVE_CLIENT = "mobile";

export const isNativeClient = (req) =>
  String(req.headers?.[CLIENT_HEADER] || "").toLowerCase() === NATIVE_CLIENT;

// The token for a native caller, or undefined for a browser — spread straight
// into a login response body so callers don't repeat the conditional:
//   res.json({ success: true, ...tokenForClient(req, token), user })
export const tokenForClient = (req, token) =>
  isNativeClient(req) ? { token } : {};
