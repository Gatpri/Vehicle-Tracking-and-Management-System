"""Regenerate expo-qr.png for this machine's current LAN address.

The committed image was generated when this machine's wifi address was
192.168.254.13. DHCP has since moved it, so scanning the old image sent the
phone to a host that no longer answers -- the same stale-IP failure that
start-lan.mjs exists to prevent, except frozen into a PNG where nothing can
correct it at runtime.

Run this whenever the LAN address changes:

    npm run qr                                      # host from .env
    npm run qr -- --detect                          # host from the wifi adapter
    python scripts/make_qr.py exp://10.0.0.4:8081   # or encode one explicitly

The default reads EXPO_PUBLIC_API_URL from .env and reuses its host, so the QR
and the app's backend always name the same machine: edit that one line after
DHCP moves the address and rerun. --detect ignores .env and asks the wifi
adapter instead, for when .env is itself the stale thing.

The QR encodes Metro (exp://<host>:8081), not the API URL verbatim -- Expo Go
needs the packager port, not the Express one. Only the host is shared.

The generated code is decoded again before the script exits. An unverified QR
is worse than none: it looks correct in a file listing and fails only in the
one place it matters, on a phone, where the error says nothing useful.

Requires: pip install qrcode pillow opencv-python
"""

import re
import subprocess
import sys
from pathlib import Path

try:
    import qrcode
except ImportError:
    sys.exit("missing dependency: pip install qrcode pillow")

# Ranges belonging to hypervisors and virtual bridges rather than the wifi a
# phone is actually on. This machine has VirtualBox (192.168.56/99.x) and WSL
# (172.28.x) adapters; a naive "first non-loopback address" picks one of those
# and produces a QR the phone cannot reach.
VIRTUAL_PREFIXES = (
    "192.168.56.",
    "192.168.99.",
    "172.17.",
    "172.18.",
    "172.28.",
    "169.254.",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT = PROJECT_ROOT / "expo-qr.png"


def resolve_lan_ip():
    """The IPv4 of the real wifi adapter, or None."""
    try:
        out = subprocess.run(
            ["ipconfig"], capture_output=True, text=True, check=True
        ).stdout.replace("\r", "")
    except (OSError, subprocess.CalledProcessError):
        return None

    adapter = ""
    fallback = None
    for line in out.split("\n"):
        if "adapter" in line:
            adapter = line
        m = re.search(r"IPv4 Address[.\s]*:\s*([0-9.]+)", line)
        if not m:
            continue
        ip = m.group(1)
        if ip.startswith("127.") or ip.startswith(VIRTUAL_PREFIXES):
            continue
        # An adapter named wifi is the strongest signal available.
        if re.search(r"wi-?fi|wireless|wlan", adapter, re.I):
            return ip
        fallback = fallback or ip
    return fallback


def env_api_url():
    """EXPO_PUBLIC_API_URL as written in .env, or None."""
    env = PROJECT_ROOT / ".env"
    if not env.exists():
        return None
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("EXPO_PUBLIC_API_URL="):
            return line.split("=", 1)[1].strip()
    return None


def host_from_env():
    """The host in EXPO_PUBLIC_API_URL, or None when unset/unparseable."""
    url = env_api_url()
    if not url:
        return None
    # http://192.168.254.18:3000 -> 192.168.254.18. Tolerates a missing scheme
    # and a trailing path, both of which people write by hand in .env.
    stripped = re.sub(r"^[a-z]+://", "", url.strip(), flags=re.I)
    host = stripped.split("/")[0].split(":")[0]
    return host or None


def verify(path, expected):
    """Decode the written PNG. Returns True only on an exact match."""
    try:
        import cv2
    except ImportError:
        print("  (opencv not installed - skipping verification)")
        return True
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(path)))
    if data == expected:
        print(f"  verified: decodes back to {data}")
        return True
    print(f"  FAILED to verify: decoded {data!r}, expected {expected!r}")
    return False


def main():
    args = [a for a in sys.argv[1:] if a]
    detect = "--detect" in args
    explicit = next((a for a in args if not a.startswith("-")), None)
    from_env = False

    if explicit:
        url = explicit
    elif detect:
        ip = resolve_lan_ip()
        if not ip:
            sys.exit(
                "Could not detect a LAN address. Pass one explicitly:\n"
                "  python scripts/make_qr.py exp://192.168.1.5:8081"
            )
        url = f"exp://{ip}:8081"
    else:
        host = host_from_env()
        if not host:
            sys.exit(
                "No EXPO_PUBLIC_API_URL in .env to read a host from.\n"
                "Set it, or detect the address instead:\n"
                "  npm run qr -- --detect"
            )
        from_env = True
        url = f"exp://{host}:8081"

    qr = qrcode.QRCode(
        version=None,
        # M tolerates ~15% damage. Worth the slightly denser code: this gets
        # scanned off a screen at an angle, not from clean print.
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    qr.make_image(fill_color="black", back_color="white").save(OUT)

    print(f"encoded: {url}")
    print(f"written: {OUT.name}  (version {qr.version})")

    ok = verify(OUT, url)

    api = env_api_url()
    if from_env:
        # .env was the source, so it cannot contradict itself here. The useful
        # check is the other direction: a .env pinned to a dead lease yields a
        # perfectly self-consistent QR that still reaches nothing.
        live = resolve_lan_ip()
        host = url[len("exp://"):].split(":")[0]
        if live and live != host:
            print(
                f"\n  WARNING: .env does not match this machine.\n"
                f"    .env says    = {host}\n"
                f"    wifi adapter = {live}\n"
                f"  The QR encodes .env, so it points at {host} -- not this\n"
                f"  machine. Set EXPO_PUBLIC_API_URL=http://{live}:3000 and\n"
                f"  rerun, or run: npm run qr -- --detect"
            )
    elif api and url.startswith("exp://"):
        host = url[len("exp://"):].split(":")[0]
        if host not in (api or ""):
            print(
                f"\n  WARNING: .env points the API elsewhere.\n"
                f"    EXPO_PUBLIC_API_URL = {api}\n"
                f"    this machine        = {host}\n"
                f"  Update .env to http://{host}:3000, or the app will load\n"
                f"  and then fail every request."
            )

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
