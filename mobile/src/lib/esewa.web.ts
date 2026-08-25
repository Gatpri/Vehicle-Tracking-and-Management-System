/**
 * eSewa checkout in a browser — the same approach the existing web app uses in
 * `vite-project/src/lib/esewa.ts`.
 *
 * The native version writes the form into a data: URI and opens it in an
 * in-app browser, because React Native has no DOM to build a form in. In a
 * browser that trick would be worse than useless: navigating the top-level
 * document to a `data:` URL is blocked outright by every modern engine.
 *
 * So on web the original technique applies — build a hidden form and submit
 * it, producing a genuine full-page navigation to eSewa. Nothing about the
 * signature changes: `fields` arrives already signed by
 * backend_api/services/esewaService.js, and success_url / failure_url still
 * point at the backend, which verifies the callback before crediting anything.
 */
export const openEsewaCheckout = async (
  url: string,
  fields: Record<string, unknown>
): Promise<void> => {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;

  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();

  // Never resolves in practice: the page is navigating away. Returning a
  // promise keeps the signature identical to the native version, so calling
  // screens do not need a platform branch.
  return new Promise<void>(() => {});
};
