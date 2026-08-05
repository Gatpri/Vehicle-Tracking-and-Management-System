// eSewa ePay v2 expects a real form POST, so this builds a hidden form and
// submits it — a genuine full-page navigation to their checkout. A fetch()
// won't do: the browser has to actually land on eSewa's page.
//
// Shared by the wallet top-up and by paying a booking directly.
export const redirectToEsewa = (url: string, fields: Record<string, unknown>) => {
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
};
