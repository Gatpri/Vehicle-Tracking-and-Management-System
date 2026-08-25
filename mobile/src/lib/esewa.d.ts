/**
 * Type surface for the platform-split eSewa checkout.
 *
 * The bundler resolves "./esewa" to esewa.native.ts or esewa.web.ts;
 * TypeScript does not follow that, so the shared signature is declared here.
 */
export declare const openEsewaCheckout: (
  url: string,
  fields: Record<string, unknown>
) => Promise<void>;
