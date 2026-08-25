/**
 * Type surface for the platform-split session store.
 *
 * The bundler resolves "./session" to session.native.ts or session.web.ts;
 * TypeScript does not follow that, so the shared signature is declared here.
 */

/** Read the token from storage into memory. Call once on app start. */
export declare const loadToken: () => Promise<string | null>;

/** The token, without touching storage. Safe to call synchronously. */
export declare const getToken: () => string | null;

export declare const setToken: (token: string) => Promise<void>;

export declare const clearToken: () => Promise<void>;
