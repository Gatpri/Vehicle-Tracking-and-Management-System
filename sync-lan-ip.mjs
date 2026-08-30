/**
 * Point every LAN-IP setting in .env at this machine's current wifi address.
 *
 * Why this exists
 * ---------------
 * Three settings have to name a real, phone-reachable IP, and DHCP changes it
 * whenever the router reboots or the laptop reconnects:
 *
 *   DOCKER_BACKEND_BASE_URL   builds the verification/eSewa links that get
 *                             emailed out, so a stale value produces a link
 *                             pointing at a machine that no longer exists
 *   DOCKER_FRONTEND_URL       where /verify-email redirects afterwards
 *   EXPO_WEB_URL              the Origin the Expo web build sends, which CORS
 *                             checks against an exact string
 *
 * Every one of them fails the same unhelpful way: the app or the email link
 * just cannot reach anything, with nothing pointing at the address being the
 * cause. Rather than hand-editing three lines and hoping none were missed,
 * this resolves the address once and rewrites all of them.
 *
 * The mobile app deliberately does NOT appear here: mobile/.env leaves
 * EXPO_PUBLIC_API_URL unset so src/lib/config.ts derives the host from Metro,
 * which `npm run start:lan` already resolves at launch.
 *
 * Usage:
 *   node sync-lan-ip.mjs          rewrite .env
 *   node sync-lan-ip.mjs --check  report drift, change nothing (exit 1 if stale)
 *
 * After a rewrite the backend has to be restarted to pick the values up, since
 * they are read into the container's environment at start:
 *   docker compose up -d backend
 */

import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const envPath = join(projectRoot, ".env");
const checkOnly = process.argv.includes("--check");

/**
 * Ranges belonging to hypervisors and container bridges, never to the wifi a
 * phone is on. Kept in step with mobile/scripts/start-lan.mjs, which has to
 * make the same call for Metro's advertised host — if the two disagree, the
 * app loads from one address and calls an API on another.
 */
const VIRTUAL_PREFIXES = [
  "192.168.56.", // VirtualBox host-only, the default
  "192.168.99.", // second VirtualBox network on this machine
  "172.17.", // Docker's default bridge
  "172.18.",
  "172.28.", // WSL / Hyper-V
  "169.254.", // link-local: no DHCP happened, unusable
];

const isUsable = (addr) =>
  addr.family === "IPv4" &&
  !addr.internal &&
  !VIRTUAL_PREFIXES.some((p) => addr.address.startsWith(p));

const resolveLanIp = () => {
  const nics = networkInterfaces();

  // Prefer an interface whose NAME says wifi — the strongest signal available,
  // and correct even when several usable addresses exist.
  for (const [name, addrs] of Object.entries(nics)) {
    if (!/wi-?fi|wireless|wlan/i.test(name)) continue;
    const hit = (addrs ?? []).find(isUsable);
    if (hit) return { ip: hit.address, via: name };
  }

  // No wifi interface (an ethernet-only desktop is legitimate).
  for (const [name, addrs] of Object.entries(nics)) {
    const hit = (addrs ?? []).find(isUsable);
    if (hit) return { ip: hit.address, via: name };
  }

  return null;
};

/**
 * Port matters and differs per key: the emailed links go through nginx on 80
 * inside Docker, while the Expo origin is Metro's 8081. Getting the port wrong
 * is as broken as getting the host wrong, so it is encoded here rather than
 * left to a blanket find-and-replace.
 */
const TARGETS = [
  { key: "DOCKER_BACKEND_BASE_URL", port: 3000 },
  { key: "DOCKER_FRONTEND_URL", port: null },
  { key: "EXPO_WEB_URL", port: 8081 },
];

const found = resolveLanIp();
if (!found) {
  console.error(
    "\nCould not find a usable LAN address.\n" +
      "Check that wifi is connected, then run `ipconfig` and edit .env by hand.\n"
  );
  process.exit(1);
}

const { ip, via } = found;
console.log(`\nThis machine: ${ip}  (${via})`);

let text;
try {
  text = readFileSync(envPath, "utf8");
} catch {
  console.error(`\nNo .env at ${envPath} — nothing to update.\n`);
  process.exit(1);
}

const changes = [];

for (const { key, port } of TARGETS) {
  const want = `http://${ip}${port ? `:${port}` : ""}`;
  // Anchored to the line start so a commented-out copy of the same key is left
  // alone rather than silently uncommented.
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const match = text.match(re);

  if (!match) {
    console.warn(`  ${key} not present in .env — skipped`);
    continue;
  }

  const current = match[1].trim();
  if (current === want) continue;

  changes.push({ key, from: current, to: want });
  text = text.replace(re, `${key}=${want}`);
}

/**
 * mobile/.env is not rewritten, only inspected: an uncommented
 * EXPO_PUBLIC_API_URL pins the app to one address, which is the failure mode
 * this whole script exists to prevent.
 */
const warnIfMobilePinned = () => {
  try {
    const raw = readFileSync(join(projectRoot, "mobile", ".env"), "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("EXPO_PUBLIC_API_URL="));
    if (!line) return;
    const value = line.split("=").slice(1).join("=").trim();
    console.warn(
      "\n  WARNING: mobile/.env pins EXPO_PUBLIC_API_URL to " + value + "\n" +
        "  That overrides the host the app derives from Metro, so it goes stale\n" +
        "  the next time this machine IP changes. Comment it out unless you are\n" +
        "  deliberately pointing the app at a tunnel or a staging server.\n"
    );
  } catch {
    // No mobile/.env is fine.
  }
};

warnIfMobilePinned();

if (changes.length === 0) {
  console.log("\nAll LAN URLs already match. Nothing to do.\n");
  process.exit(0);
}

for (const c of changes) {
  console.log(`  ${c.key}\n    ${c.from}  ->  ${c.to}`);
}

if (checkOnly) {
  console.error("\n.env is stale (run without --check to fix).\n");
  process.exit(1);
}

writeFileSync(envPath, text);
console.log(
  "\nUpdated .env. The backend reads these at startup, so restart it:\n" +
    "  docker compose up -d backend\n"
);
