import * as WebBrowser from "expo-web-browser";

/**
 * Native counterpart to the web app's src/lib/esewa.ts.
 *
 * eSewa's ePay v2 requires a real form POST to their checkout page — a fetch
 * will not do, because the browser has to actually land there. The web app
 * builds a hidden form in the DOM and submits it. A React Native app has no
 * DOM to build one in.
 *
 * So the same form is written as a self-submitting HTML document and opened in
 * the system in-app browser (SFSafariViewController / Chrome Custom Tabs) via
 * a data: URI. From eSewa's side this is indistinguishable from the web flow:
 * the same signed fields arrive by POST from a real browser.
 *
 * Nothing about the signature changes and nothing is signed on the device —
 * `fields` arrives already signed by backend_api/services/esewaService.js, and
 * success_url / failure_url still point at the backend, which verifies the
 * callback signature before crediting anything. The phone is only the
 * transport.
 */
export const openEsewaCheckout = async (
  url: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const inputs = Object.entries(fields)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}">`
    )
    .join("");

  // The form submits from an onload handler rather than a script at the end of
  // body, so it fires after the document is fully parsed — a partially parsed
  // form would post an incomplete field set.
  const html = `<!DOCTYPE html>
<html>
  <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body onload="document.forms[0].submit()" style="font-family:sans-serif;padding:24px;text-align:center">
    <p>Taking you to eSewa…</p>
    <form method="POST" action="${escapeHtml(url)}">${inputs}</form>
  </body>
</html>`;

  const dataUri = `data:text/html;base64,${base64(html)}`;

  await WebBrowser.openBrowserAsync(dataUri, {
    // Matches the app rather than the OS default, so the handoff does not look
    // like it left the product.
    toolbarColor: "#0f1e3a",
    controlsColor: "#ffffff",
    // Dismissing returns the user to wherever they were; the screen that
    // opened this refetches on focus, so a completed payment shows up without
    // the app needing a callback of its own.
    showTitle: true,
  });
};

/**
 * Escapes text for an HTML attribute. The field values are server-generated
 * rather than user input, but a stray quote in an address or a product code
 * would silently break the form, and the cost of being careful is nil.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * UTF-8 safe base64. React Native has no btoa, and the naive alternatives
 * mangle any non-ASCII character — which a Nepali address will contain.
 */
const base64 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : chars[b2 & 63];
  }
  return out;
};
