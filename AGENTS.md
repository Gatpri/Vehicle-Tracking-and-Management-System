# AGENTS.md

Conventions for AI coding agents working in this repository. Read this before
making changes; it records decisions that are easy to undo by accident.

For architecture, setup and troubleshooting, see [README.md](README.md).

---

## Ground rules

1. **One `.env`, at the repo root.** Every service reads it — backend, ANPR
   service, Vite, and Docker Compose. Do not create per-package `.env` files.
   `mobile/.env` is the sole exception (Expo requires it) and holds only
   `EXPO_PUBLIC_*` values.
2. **Never commit secrets.** Only `VITE_*` and `EXPO_PUBLIC_*` reach client
   bundles; everything else in `.env` is secret and the file is gitignored.
3. **The backend is authoritative.** Client-side role and permission checks
   shape the UI only. Every rule must also be enforced server-side.
4. **Match the surrounding code.** This codebase comments the *why* — the
   non-obvious constraint, the approach that was tried and failed. Match that
   density and voice rather than restating what the code already says.

---

## Things that look wrong but are deliberate

Changing any of these will break something that currently works.

| Code | Why it is that way |
|---|---|
| `middleware/auth.js` checks the **cookie before** the `Authorization` header | Reordering lets a browser be talked into authenticating with an attacker-supplied header, defeating the httpOnly cookie's XSS protection |
| `vite.config.ts` proxies **both** `/api` and `/socket.io` | Without the socket entry, Vite answers the handshake with the SPA's `index.html`. Chat then fails **silently** from the browser while mobile works |
| `vite.config.ts` has no `rewrite` on `/api` | The backend mounts every router under `/api` itself; stripping the prefix 404s every route |
| `mobile/.env` leaves `EXPO_PUBLIC_API_URL` commented out | It overrides the host derived from Metro, so it goes stale on the next DHCP change. `npm run lan` warns if it is set |
| CORS `origin` is a **function**, not an array | A static list cannot cover localhost plus a changing LAN IP across ports 80/3000/5173/8081. Fixing one client used to evict the other |
| CORS keys off `ALLOW_LAN_CORS`, not `NODE_ENV` | `Dockerfile.backend` sets `NODE_ENV=production` even in local dev, so keying off it would disable LAN access in exactly the setup that needs it |
| `allowedHeaders` lists `x-client` and `Authorization` | The mobile client sends both. An unlisted header makes the browser block the request, surfacing as "cannot reach the server" rather than a CORS error |
| `Message.text` is not `required` | Unsend blanks it. Validation lives in the handlers instead |
| `getIO().to(rooms).emit(...)` is one call, not a loop | A socket is often in two matching rooms; a per-room loop delivers the message twice |
| `docker-compose.dev.yml` polls with `find -newer` instead of `node --watch` | Docker Desktop does not propagate inotify events from a Windows host into a Linux container, so `--watch` never fires. `CHOKIDAR_USEPOLLING` does not help — that is read by chokidar, not node's own watcher |
| The ANPR service serializes inference behind a lock | Ultralytics models are not safe to call concurrently, and the camera poller scans several feeds at once |

---

## Networking

The most common class of bug in this project. Symptoms are misleading: a stale
address surfaces as "cannot reach the server", never as anything pointing at the
address itself.

- **Never hardcode a LAN IP** in source. Three values in `.env`
  (`DOCKER_BACKEND_BASE_URL`, `DOCKER_FRONTEND_URL`, `EXPO_WEB_URL`) name one, and
  `npm run lan` keeps them current.
- **After changing them**, restart the backend: `docker compose up -d backend`.
  The container reads env at startup.
- **`localhost` is wrong in anything emailed.** It resolves to whichever device
  opens the link.
- **Check before debugging further:** `npm run lan:check` reports drift and exits
  non-zero if stale.

---

## Verifying changes

Run what the change touches; do not report success without it.

```bash
cd vite-project && npx tsc --noEmit -p tsconfig.app.json    # web types
cd vite-project && npx vite build                           # web build
cd mobile && npx tsc --noEmit                               # mobile types
node --check vite-project/backend_api/<file>.js             # backend syntax
```

For behaviour, prefer an end-to-end check against the running stack over
reasoning about it. Both auth paths matter, and they fail independently:

```bash
# Web path — cookie
curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:5173' \
  -d '{"email":"...","password":"..."}'

# Mobile path — bearer token
curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' -H 'x-client: mobile' \
  -d '{"email":"...","password":"..."}'
```

**Clean up after testing.** Remove scratch scripts, test users, and any rows
written to MongoDB.

---

## Web and mobile parity

The two clients share a backend and must agree on meaning.

- `roles.ts`, `bookingWorkflow.ts` and `permissions.ts` exist in both
  `vite-project/src/lib/` and `mobile/src/lib/`. **A change to one belongs in the
  other.** `bookingWorkflow.ts` is byte-for-byte identical.
- Mobile splits four modules by platform (`Map`, `session`, `esewa`, `socket`)
  via `.native.tsx` / `.web.tsx`. Import the bare name — never the suffixed file.
- Two screens are intentionally *not* literal ports: **CCTV** (the web enumerates
  video devices; mobile scans with the phone camera) and **password recovery**
  (three web routes collapsed into one staged screen).

---

## Documentation

This project keeps **exactly two** markdown files:

- `README.md` — everything a human needs: architecture, setup, operations
- `AGENTS.md` — this file

Do not add `NOTES.md`, `CHANGELOG.md`, `FIXES.md`, or per-directory READMEs.
New information belongs in the right section of one of these two. Summaries of
work performed belong in the pull request or the commit message, not in a file.

---

## Commits

- Describe the change and its reason; the diff already shows the mechanics.
- Do not commit `.env`, weights (`*.pt`), `node_modules/`, or build output.
- Large media belongs in `vite-project/public/video/` and should be compressed
  first — a background clip has no business being 37 MB.
