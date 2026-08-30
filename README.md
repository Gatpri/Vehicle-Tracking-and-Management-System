# VeriTrack

**Vehicle theft detection and workshop management for Nepali vehicles.**

CCTV footage is read by a locally-trained YOLO model — detection-as-OCR, because
generic OCR engines cannot read hand-painted Devanagari plates. Around that sits a
full platform: vehicle records, workshop bookings, deliveries, wallets, live
tracking and SOS alerts, delivered as a **web app and a native mobile app sharing
one backend**.

---

## Contents

- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Networking and LAN addresses](#networking-and-lan-addresses)
- [Running without Docker](#running-without-docker)
- [Mobile app](#mobile-app)
- [ANPR service](#anpr-service)
- [Sentiment analysis](#sentiment-analysis)
- [Roles and permissions](#roles-and-permissions)
- [Status](#status)
- [Troubleshooting](#troubleshooting)

---

## Architecture

| Service | Stack | Port | Container |
|---|---|---|---|
| Frontend | React + TypeScript (Vite), served by nginx | `80` | `anpr_frontend` |
| Backend API | Node + Express + Mongoose + Socket.IO | `3000` | `anpr_backend` |
| ANPR service | Python + Starlette + YOLO (Ultralytics) | `8000` | `anpr_service` |
| Database | MongoDB 7 | `27017` | `anpr_mongodb` |
| Mobile | React Native (Expo) — iOS, Android, web | `8081` | `anpr_mobile` |

In Docker, nginx fronts everything on port **80** and proxies `/api` and
`/socket.io` to the backend, so the browser only ever needs one origin.

The mobile app talks to the **same Express backend** as the web app — no second
server, no duplicated models, no separate database.

```
                    ┌──────────────┐
   Web browser ────▶│    nginx     │──┐
                    │   (port 80)  │  │
                    └──────────────┘  │   ┌──────────────┐    ┌─────────────┐
                                      ├──▶│ Express API  │───▶│  MongoDB    │
   Expo app  ───────────────────────  ┘   │  (port 3000) │    │             │
   (iOS / Android)                        └──────┬───────┘    └─────────────┘
                                                 │
                                                 ▼
                                         ┌──────────────┐
                                         │ ANPR service │
                                         │  YOLO + LLM  │
                                         └──────────────┘
```

---

## Quick start

```bash
cp .env.example .env      # then fill in the blanks — see Configuration
docker compose up -d --build
```

Open <http://localhost>.

`docker-start.bat` / `docker-start.ps1` wrap this and bootstrap `.env` from the
template if it is missing.

| Command | What it does |
|---|---|
| `docker compose ps` | Health of all services |
| `docker compose logs -f backend` | Tail one service |
| `docker compose down` | Stop (data survives in volumes) |
| `npm run lan` | Point every LAN URL at this machine's current IP |
| `npm run lan:check` | Report drift without changing anything |

### Live reload during development

The production image copies the backend source in and runs it with plain `node`,
so an edit changes nothing until the image is rebuilt. The dev overlay adds a
watcher that restarts the process on any source change:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d backend
```

Plain `docker compose up -d backend` returns to the production command.

---

## Configuration

All configuration lives in a **single `.env` at the repo root**. Every service
reads that one file:

| Consumer | How it reads `.env` |
|---|---|
| Backend | `vite-project/backend_api/env.js` |
| ANPR service | `python-dotenv` in `server.py` |
| Frontend | `envDir` in `vite.config.ts` — only `VITE_*` keys reach the browser |
| Docker Compose | substitutes `${VAR}` automatically |

At minimum you need `JWT_SECRET` (generate with `openssl rand -hex 32`), the
Gmail SMTP pair, the Firebase Admin credentials, and `GEMINI_API_KEY`.

> **Never commit `.env`.** Only `EXPO_PUBLIC_*` and `VITE_*` values are exposed to
> client bundles; treat everything else as secret.

---

## Networking and LAN addresses

This is the single most common source of confusing failures, so it is worth
understanding before something breaks.

Three settings must name an address the **recipient's device** can reach, and DHCP
changes that address whenever the router reboots or the laptop reconnects:

| Key | Used for |
|---|---|
| `DOCKER_BACKEND_BASE_URL` | Builds the verification and eSewa links that get emailed out |
| `DOCKER_FRONTEND_URL` | Where `/verify-email` redirects afterwards |
| `EXPO_WEB_URL` | The Origin the Expo web build sends, checked by CORS |

`localhost` is wrong for all three unless you only ever use a desktop browser on
this machine: in an email, `localhost` resolves to whichever device opens it, and
mobile mail clients render such links as dead plain text.

**Keep them current with one command:**

```bash
npm run lan                      # rewrite all three to this machine's IP
docker compose up -d backend     # the container reads them at startup
```

The script resolves the live wifi address, deliberately skipping VirtualBox, WSL
and Docker bridge interfaces, which a phone cannot route to.

### What does *not* need updating

- **The mobile app.** `mobile/.env` leaves `EXPO_PUBLIC_API_URL` unset on purpose
  so `src/lib/config.ts` derives the backend host from whatever address Metro is
  serving on. Pinning it reintroduces exactly the staleness above — `npm run lan`
  warns if someone does.
- **CORS.** The backend accepts any loopback or private-LAN origin on any port in
  development, so an IP change cannot break the web app or the mobile app. Public
  origins are still rejected. Set `ALLOW_LAN_CORS=false` for a real deployment,
  where the explicit `FRONTEND_URL` / `EXPO_WEB_URL` allowlist applies instead.

### Firewall

A phone on the same wifi needs inbound TCP **3000** (backend) and **8081** (Metro)
allowed. `mobile/allow-firewall-dev-ports.ps1` adds both — run it once, as
Administrator.

---

## Running without Docker

MongoDB must be reachable at the `MONGODB_URI` in `.env`; the compose file can
supply just the database with `docker compose up -d mongodb`.

```bash
cd vite-project
npm install
npm run dev      # frontend on :5173, proxies /api and /socket.io to :3000
npm start        # backend on :3000 (nodemon)
npm run anpr     # ANPR service on :8000
```

> PowerShell 5.1 has no `&&`; chain with `;` instead.

---

## Mobile app

One codebase runs on **three targets**: iOS, Android, and the browser. Every role
the web app supports is present.

```bash
cd mobile
npm install
npm run start:lan -- --clear
```

`start:lan` resolves the live wifi address and starts Metro bound to it, so a
phone on the same network connects with no configuration.

| Target | How |
|---|---|
| iPhone | Scan the QR code with the Camera app (needs Expo Go) |
| Android | Press `a` for an emulator, or scan with Expo Go |
| Browser | Press `w`, or open <http://localhost:8081> |

**The backend must be running** — `npm start` in `vite-project/`, or the Docker
stack.

### Authentication differs by client, deliberately

The web session is an httpOnly cookie, which a native app cannot use. Rather than
weaken the web, the backend accepts either form:

| File | Role |
|---|---|
| `middleware/auth.js` | Checks the cookie **first**, then an `Authorization: Bearer` header |
| `config/clientKind.js` | Only a client sending `x-client: mobile` gets a token in the login response |
| `config/socket.js` | Same fallback for the Socket.IO handshake |

**Cookie-first is deliberate and must not be reordered:** it means a browser can
never be talked into authenticating with an attacker-supplied header, so the web
app's XSS protection survives intact. The mobile token lives in the OS keystore
(`expo-secure-store`), not AsyncStorage.

### Platform splits

Four modules genuinely cannot be written once. The bundler picks `.native.tsx` for
iOS/Android and `.web.tsx` for the browser; every consumer just imports `"./Map"`.

| Module | Native | Web | Why it splits |
|---|---|---|---|
| `components/Map` | react-native-maps | Leaflet via CDN | react-native-maps has no web build |
| `lib/session` | expo-secure-store | localStorage | The secure-store web build stores nothing |
| `lib/esewa` | form in a `data:` URI | hidden form + submit | Browsers block top-level `data:` navigation |
| `lib/socket` | websocket only | websocket + polling | Proxies still block raw websockets |

### Shared logic

`src/lib/roles.ts`, `bookingWorkflow.ts` and `permissions.ts` are ports of the web
app's files — `bookingWorkflow.ts` byte-for-byte. **Keep them in sync:** both
clients must agree on what a status means and who can see what.

### Optional setup

| Feature | Needed for | What to do |
|---|---|---|
| Google sign-in | The Google button (hidden until configured) | Create Android/iOS/Web OAuth client IDs in Google Cloud Console under the same project as Firebase, then set the three `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values |
| Google Maps | Android **release** builds only | Add an Android Maps SDK key to `app.json` under `expo.android.config.googleMaps.apiKey` |
| Background location | Delivery staff sharing position while backgrounded | A development build — `npx expo run:android`; Expo Go cannot do this |
| eSewa | — | Nothing. Payments reuse the backend's signed-form flow |

Restart Metro after editing `.env` — Expo reads env vars at bundle time, not
runtime.

---

## ANPR service

Runs the trained YOLO weights locally and serves them over HTTP to the Node
backend. Everything runs offline; there is no hosted inference API.

### Weights

**The trained weights are not in this repo.** Point `ANPR_WEIGHTS_DIR` at the
folder holding them:

| File | Role |
|---|---|
| `plate_detector_nepali.pt` | Stage 1 — preferred, fine-tuned on Nepali roads |
| `plate_detector.pt` | Stage 1 — generic fallback when the above is absent |
| `char_reader.pt` | Stage 2 — 38-class Devanagari character reader (primary) |
| `char_unified.pt` | 57-class reader, challenges the primary on embossed plates |

### API

`GET /health` → device, weights directory, whether the embossed reader loaded.

`POST /detect` — request body is the raw image bytes.

| Query param | Default | Meaning |
|---|---|---|
| `plateConf` | 0.25 | Stage-1 confidence threshold |
| `charConf` | 0.25 | Stage-2 confidence threshold |
| `imgsz` | 1280 | Stage-1 resolution; higher finds smaller plates |
| `tiles` | false | Also scan four overlapping tiles — finds small plates, costs time |
| `cameraId` | none | Enables multi-frame voting for that feed |

```json
{
  "detected": true,
  "box": { "x": 422, "y": 237, "width": 264, "height": 202, "confidence": 83.1 },
  "text": "1 9 Pa 4 6 3 0",
  "textConfidence": 80.6,
  "plates": []
}
```

`x`/`y` are the box **centre** in source-image pixels; confidences are 0–100.

`detected` reports whether stage 1 localized a plate. When `false`, `text` is
still a real read — stage 1 is trained on full scenes and finds nothing inside an
already-cropped plate photo, so the service falls back to reading the whole image.

### Multi-frame voting

The character reader sits at recall ≈0.79 — roughly one character in five is
missed on hard images. Passing `?cameraId=<id>` matches each plate box to a track
by IoU and votes **per character position** across readings.

Character voting recovers a plate no single frame read correctly, which is the
common case when misses are uncorrelated; whole-string voting would need the same
complete misread to recur before it won.

A plate reports `track.stable` only after being read consistently across several
frames — the bar an alert should clear before accusing someone of driving a stolen
vehicle. Both `frameText` (this frame) and `text` (the vote) are returned.

### Known limitation

Stage 2 is trained on 5,298 Nepali images. Stage 1 was not — it shipped as a
generic `License_Plate` detector and scores ≈0.28 on genuine plates in real
Kathmandu traffic. `anpr_service/training/` holds the fix: `build_plate_dataset.py`
merges the source datasets, `plate_detector_colab.ipynb` trains on a Colab T4, and
`benchmark_video.py` measures the pipeline on real footage.

### Why detection instead of OCR

Character detection **is** the OCR. Generic OCR engines cannot read hand-painted
Devanagari plates; a class-per-character detector can only ever emit valid plate
characters. Inference is serialized behind a lock — Ultralytics models are not
safe to call concurrently, and the camera poller scans several feeds at once.

---

## Sentiment analysis

Review and feedback text is classified as **positive**, **negative**, **neutral**,
or **unavailable** when the LLM services are down.

Gemini Flash 2.5 is primary with Mistral as fallback, both called from the ANPR
service's `/sentiment` endpoint. The Node controllers reach it through
`services/sentimentService.js`, which is separate from `anprService.js` — the two
share a container but are read by different modules, each with its own env var.
Setting only one leaves the other pointing at `127.0.0.1`, which inside the
container is the backend itself.

Configure with `GEMINI_API_KEY` and optionally `MISTRAL_API_KEY`.

---

## Roles and permissions

| Role | Scope |
|---|---|
| `superadmin` | Everything |
| `admin` | General administration |
| `workshop-admin` | One workshop's bookings and staff |
| `delivery-admin` | Sees delivery staff nationwide; add/remove only within their own region, enforced server-side |
| `accounting-admin` | Wallets, withdrawals, transactions |
| `vehicle-tracking-admin` | CCTV, sightings, theft reports |
| `delivery-staff` | Assigned pickups and drop-offs |
| `user` | Customer — vehicles, bookings, SOS |

Permissions are defined in `backend_api/policies/permissions.js` and mirrored in
both clients. The backend is authoritative; client checks only shape the UI.

---

## Status

**No known open issues.** Every item in the table below has been fixed and
verified end to end against the running stack.

| Check | State |
|---|---|
| Web typecheck (`tsc --noEmit`) | passing |
| Mobile typecheck (`tsc --noEmit`) | passing |
| Web production build (`vite build`) | passing |
| Backend — every `.js` file parses | passing |
| All five containers | healthy |
| Endpoints `:3000` `:80` `:5173` `:8081` | responding |
| CORS: LAN origins allowed, public blocked | verified |
| LAN URL drift (`npm run lan:check`) | none |

Re-run these at any time:

```bash
cd vite-project && npx tsc --noEmit -p tsconfig.app.json && npx vite build
cd mobile && npx tsc --noEmit
npm run lan:check
docker compose ps
```

---

## Troubleshooting

These were real failures in this project. All are **fixed** — the table records
what caused each one, because the symptoms are misleading and the same mistakes
are easy to reintroduce.

| Symptom | Cause | Resolution |
|---|---|---|
| **Web chat sends nothing, mobile works** | Vite proxied `/api` but not `/socket.io`, so the dev server answered the handshake with the SPA's `index.html`. The socket never connected and `emit` failed **silently** | Fixed — `vite.config.ts` now proxies `/socket.io` with `ws: true`. Keep both entries |
| **"Cannot reach the server" on a phone** | Metro was started before `.env` changed, so no API URL was inlined into the bundle. The app fell back to `localhost`, which on a phone is the phone itself | Fixed — `mobile/.env` no longer pins the URL; the host is derived from Metro. Start with `npm run start:lan -- --clear` |
| **Verification email link is dead** | `DOCKER_BACKEND_BASE_URL` pointed at a stale IP with no port. Mobile mail clients also render `localhost` links as dead plain text | Fixed — `npm run lan` keeps it current; the email now carries a tappable button *and* the raw URL |
| **"Invalid Link" after clicking a verification email** | The link was opened twice — mail clients prefetch — and the first click consumed the pending row | Fixed — a repeat click confirms success when the account already exists |
| **Login works on one client, breaks on the other** | CORS used a static origin list, which could not cover localhost plus a changing LAN IP across four ports. Fixing one client evicted the other | Fixed — the origin check is now a function accepting any private-LAN origin in dev. Set `ALLOW_LAN_CORS=false` in production |
| **A code change has no effect** | The container runs the copy baked into the image, so edits do nothing until a rebuild. Everything looks healthy meanwhile | Use the dev overlay (live reload), or `docker compose up -d --build backend` |
| **Docker CLI: "cannot find the file specified"** | Docker Desktop's backend died with its window still open | Quit fully, `wsl --shutdown`, start again |

> Most of these share one root cause: **a hardcoded or stale LAN address**. When
> something is unreachable, run `npm run lan:check` before investigating further.

---

## Repository layout

```
vite-project/            web app + backend + ANPR service
  src/                   React frontend
  backend_api/           Express API, Socket.IO, models, policies
  anpr_service/          Python YOLO inference + sentiment
mobile/                  React Native (Expo) client
docker-compose.yml       production stack
docker-compose.dev.yml   dev overlay: backend live reload
sync-lan-ip.mjs          keeps LAN URLs current (npm run lan)
.gitattributes           normalizes line endings to LF
AGENTS.md                conventions for AI coding agents
```
