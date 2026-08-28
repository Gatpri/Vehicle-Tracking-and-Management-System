# Vehicle Safety — mobile app

A React Native (Expo) client for the platform in `vite-project/`. It talks to
the **same Express backend** as the web app — there is no second server, no
duplicated models, and no separate database.

Every role the web app supports is here: customer, the six admin-tier roles,
and delivery staff.

---

One codebase runs on **three targets**: iOS, Android, and the browser.

## Running it

```bash
cd mobile
npm install
npx expo start
```

Then, from the same dev server:

| Target | How |
|---|---|
| **Browser** | press `w`, or open `http://localhost:8081` |
| **iPhone** | scan the QR code with the Camera app (needs Expo Go) |
| **Android** | press `a` for an emulator, or scan with Expo Go |

On a physical device over the LAN, pin the host so Metro does not advertise a
virtual adapter (this machine has VirtualBox and WSL interfaces alongside the
real wifi one).

**Do not hardcode the address here.** DHCP reassigns it, and a stale value is
exactly what produces `Could not connect to the server — exp://<old-ip>:8081`
on the phone. Read the current wifi address first, then start Metro with it:

```bash
# Windows (Git Bash): IPv4 of the real wifi adapter
ipconfig | grep -A4 "adapter WiFi" | grep "IPv4"

REACT_NATIVE_PACKAGER_HOSTNAME=<that-address> npx expo start --clear
```

The same address must also be `EXPO_PUBLIC_API_URL` in `.env`
(`http://<that-address>:3000`), so the app's API calls reach the same machine
Metro is served from. Both change together whenever the LAN address does.

### The web target vs. `vite-project`

These are two different browser apps and both are legitimate:

- **`vite-project`** is the production website. Its session lives in an
  httpOnly cookie, which is the hardened arrangement, and nginx proxies `/api`
  for it.
- **The Expo web build** is this same codebase running in a browser — useful
  for developing without a device, and for demonstrating all three targets
  from one source. Its session is in `localStorage` (see the note in
  `src/lib/session.web.ts`), which is weaker.

Prefer `vite-project` for anything user-facing in a browser.

**The backend must be running** (`npm start` in `vite-project/`, or the Docker
stack). In development the app works out where the backend is by itself: it
takes the host serving the Metro bundle and assumes port 3000, so a phone on
the same wifi connects with no configuration. Override with
`EXPO_PUBLIC_API_URL` in `.env` only if that guess is wrong.

> On a physical device, make sure the phone and the computer are on the same
> network, and that Windows Firewall is not blocking port 3000.

---

## What you need to do — checklist

Most of the setup is already done. These are the parts that need an account,
a device, or a key that only you can create.

### 1. Google sign-in — required only if you want the Google button

Email/password sign-in works right now with no further setup. The Google
button stays **hidden** until the three client IDs below are filled in, so
nothing is broken while this is pending.

The Firebase values in `.env` were copied across from the web app already.
What is missing is the OAuth client IDs, because Google issues those per
platform and a mobile client cannot reuse the web one.

**In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)**,
with the project set to the same one Firebase uses
(`th-sem-project-6b56f`):

1. **Android client** — *Create credentials → OAuth client ID → Android*
   - Package name: `com.vehiclesafety.mobile` (already set in `app.json`)
   - SHA-1 fingerprint: run this and paste the `SHA1` line:
     ```bash
     cd mobile
     npx expo credentials:manager
     # or, for a local debug build:
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```
   - Put the resulting ID in `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

2. **iOS client** — *Create credentials → OAuth client ID → iOS*
   - Bundle ID: `com.vehiclesafety.mobile`
   - Put it in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - Skip this entirely if you are not building for iOS (it needs a Mac).

3. **Web client** — *Create credentials → OAuth client ID → Web application*
   - This one is **not** for a website: Firebase uses it as the audience when
     verifying the token, so it is needed even on a device build.
   - Put it in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

4. **In the Firebase console** → *Authentication → Sign-in method*, make sure
   **Google** is enabled. It already is if Google sign-in works on the web.

Restart `npx expo start` after editing `.env` — Expo reads env vars at bundle
time, not at runtime.

### 2. Google Maps on Android — required for a release build only

The maps on the tracking, safety and staff-location screens use the platform's
own map. On iOS that is Apple Maps and needs nothing. On Android, Google Maps
needs an API key for a **release** build (debug builds and Expo Go work
without one).

- Create an **Android** key in Google Cloud Console with the *Maps SDK for
  Android* enabled, then add to `app.json` under `expo.android`:
  ```json
  "config": { "googleMaps": { "apiKey": "YOUR_KEY" } }
  ```

### 3. A development build — required for background location

Expo Go cannot run background location. The delivery-staff screen keeps
sharing a driver's position while the app is backgrounded, and that needs a
development build:

```bash
npx expo run:android          # local build, needs Android Studio
# or
npx eas build --profile development --platform android
```

Everything else in the app runs fine in Expo Go.

### 4. Nothing to do for eSewa

Payments reuse the backend's existing signed-form flow. The app opens eSewa's
checkout in an in-app browser and eSewa calls the backend directly, exactly as
on the web. No mobile-specific merchant configuration.

---

## What changed in the backend

Five files, all additive — **the web app's behaviour is unchanged**.

The web session is an httpOnly cookie, which a native app cannot use (there is
no cookie jar tied to an origin). Rather than weaken that, the backend now
accepts either form:

| File | Change |
|---|---|
| `middleware/auth.js` | `readSessionToken` checks the cookie **first**, then falls back to an `Authorization: Bearer` header |
| `config/clientKind.js` | *(new)* only a client sending `x-client: mobile` gets the token in a login response body |
| `config/socket.js` | same fallback for the handshake, via `handshake.auth.token` |
| `routes/login.js` | includes the token for native callers |
| `routes/google_auth_signup.js` | the same, for the Google path |

**Cookie-first is deliberate and should not be reordered**: it means a browser
can never be talked into authenticating with an attacker-supplied header, so
the web app's XSS protection survives intact. The mobile token is held in the
OS keystore (`expo-secure-store`), not in AsyncStorage.

---

## Layout

```
app/                      routes (expo-router builds the navigator from this tree)
  _layout.tsx             auth provider + the role guard
  index.tsx               cold-start redirect to the right area
  (auth)/                 login, signup, password recovery
  (customer)/             tabs: home, vehicles, workshops, bookings, SOS
  (admin)/                drawer: 12 screens, each permission-gated
  (staff)/                tabs: deliveries, earnings, chat
src/
  lib/                    api, session, socket, auth, workflow logic
  components/             shared UI, chat, map, admin list
  theme/                  design tokens ported from the web theme.css
```

### Shared with the web app

`src/lib/roles.ts`, `bookingWorkflow.ts` and `permissions.ts` are ports of the
web app's own files — in the case of `bookingWorkflow.ts`, byte-for-byte. They
are pure TypeScript with no DOM in them, so there was nothing to adapt, and
both clients must agree on what a status means and who can see what.

**Keep them in sync.** A change to the web file belongs here too.

---

## How three platforms share one codebase

Four modules genuinely cannot be written once, so each is split by filename.
The bundler picks `.native.tsx` for iOS/Android and `.web.tsx` for the
browser; a `.d.ts` alongside them declares the shared signature, because
TypeScript does not follow that resolution. **Every consumer just imports
`"./Map"` and stays platform-agnostic.**

| Module | Native | Web | Why it had to split |
|---|---|---|---|
| `components/Map` | react-native-maps | Leaflet via CDN | react-native-maps has **no web build** — importing it in a browser bundle throws at module load |
| `lib/session` | expo-secure-store (OS keystore) | localStorage | expo-secure-store's web build is an empty stub that stores nothing, so sessions would vanish on reload |
| `lib/esewa` | form in a `data:` URI, in-app browser | hidden form + submit | Browsers block top-level navigation to `data:` URLs; RN has no DOM to build a form in |
| `lib/socket` | websocket only | websocket + polling fallback | Corporate proxies still block raw websockets, and a browser has no cellular path to fall back to |

Leaflet is loaded from a CDN at runtime rather than added as a dependency,
which keeps it out of the iOS and Android bundles entirely. Verified: the
native bundles contain zero Leaflet references, and the web bundle contains
zero react-native-maps references.

`lib/config.ts` also branches — in a browser the page already has a real
origin, so the API address comes from `window.location` rather than a guessed
LAN IP, which is what makes a deployed web build work at all.

## Known differences from the web app

Two screens are deliberately not literal ports:

- **CCTV** (`app/(admin)/cctv.tsx`) — the web page enumerates the machine's
  video devices with `navigator.mediaDevices` and streams a webcam to the ANPR
  service. That is a desk workflow with no phone equivalent. The mobile screen
  keeps the live sightings feed and adds plate scanning through the phone
  camera, hitting the same `/cctv/scan` endpoint.
- **Password recovery** — three web routes collapsed into one screen with
  stages, since the user never leaves the app to click an emailed link.
