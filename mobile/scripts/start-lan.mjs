/**
 * Start Metro bound to this machine's real wifi address.
 *
 * Why this exists
 * ---------------
 * `npx expo start` on its own advertises `exp://127.0.0.1:8081` whenever it
 * cannot confidently pick an interface. 127.0.0.1 means "this device", so a
 * phone scanning that QR code tries to reach ITSELF on port 8081 and fails
 * with "could not connect to the server" -- an error that reads like a network
 * fault and is actually just the wrong address in the URL.
 *
 * The documented workaround is REACT_NATIVE_PACKAGER_HOSTNAME=<ip>, but a
 * hardcoded <ip> goes stale: DHCP reassigns it after a router reboot or a
 * reconnect, and then the QR points somewhere real but wrong. This resolves
 * the address at launch instead, so it is right by construction.
 *
 * Picking the interface matters. This machine has several:
 *
 *   192.168.56.1   VirtualBox host-only   - phone cannot route to it
 *   192.168.99.1   VirtualBox host-only   - phone cannot route to it
 *   172.28.160.1   WSL Hyper-V bridge     - phone cannot route to it
 *   192.168.254.x  the actual wifi        - the only one that works
 *
 * Node's os.networkInterfaces() does not label which is which, so virtual
 * ranges are excluded explicitly below rather than by guessing at "first
 * non-internal", which would happily return the VirtualBox address.
 *
 * It also checks .env's EXPO_PUBLIC_API_URL against the resolved address and
 * warns on a mismatch: Metro and the API have to point at the same machine,
 * and having fixed one but not the other is the most common way this breaks.
 */

import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");

/** Ranges belonging to hypervisors, never to the wifi a phone is on. */
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

  // Prefer an interface whose NAME says wifi -- the strongest signal available,
  // and correct even when several usable addresses exist.
  for (const [name, addrs] of Object.entries(nics)) {
    if (!/wi-?fi|wireless|wlan/i.test(name)) continue;
    const hit = (addrs ?? []).find(isUsable);
    if (hit) return { ip: hit.address, via: name };
  }

  // No wifi interface (an ethernet-only desktop is legitimate). Fall back to
  // any usable address, which the exclusions above have already filtered.
  for (const [name, addrs] of Object.entries(nics)) {
    const hit = (addrs ?? []).find(isUsable);
    if (hit) return { ip: hit.address, via: name };
  }

  return null;
};

/** EXPO_PUBLIC_API_URL as written in .env, or null when unset/absent. */
const apiUrlFromEnvFile = () => {
  try {
    const raw = readFileSync(join(projectRoot, ".env"), "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith("EXPO_PUBLIC_API_URL="));
    return line ? line.split("=").slice(1).join("=").trim() : null;
  } catch {
    return null; // no .env is fine; config.ts derives the host instead
  }
};

const found = resolveLanIp();

if (!found) {
  console.error(
    "\nCould not find a usable LAN address.\n" +
      "Check that wifi is connected, then run `ipconfig` and start Metro with:\n" +
      "  $env:REACT_NATIVE_PACKAGER_HOSTNAME='<your-ip>'; npx expo start --clear\n"
  );
  process.exit(1);
}

const { ip, via } = found;
console.log(`\nMetro host: ${ip}  (${via})`);

const apiUrl = apiUrlFromEnvFile();
if (apiUrl && !apiUrl.includes(ip)) {
  console.warn(
    `\n  WARNING: .env points the API somewhere else.\n` +
      `    EXPO_PUBLIC_API_URL = ${apiUrl}\n` +
      `    this machine        = ${ip}\n` +
      `  The app will load but every request will fail. Update .env to:\n` +
      `    EXPO_PUBLIC_API_URL=http://${ip}:3000\n`
  );
}

console.log("");

// Pass through whatever extra flags the caller gave (--clear, --tunnel, ...).
//
// shell:true is required on Windows: npx is a .cmd shim, not an executable,
// and spawning it directly fails with EINVAL under Node's default
// (non-shell) spawn since the CVE-2024-27980 hardening.
const child = spawn("npx", ["expo", "start", ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: ip },
});

child.on("exit", (code) => process.exit(code ?? 0));
