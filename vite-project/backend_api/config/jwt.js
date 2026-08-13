// Single source of truth for the signing secret. Previously each call site did
// `process.env.JWT_SECRET || "your-secret-key-change-this"` — with the env var
// unset that fallback silently signed every token with a string committed to
// the repo, letting anyone who read the source forge a superadmin token.
// Refusing to boot is the only safe response to a missing secret.
export const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and add it " +
    "to your .env / docker-compose environment before starting the backend.",
  );
}
