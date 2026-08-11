#!/usr/bin/env python3
"""
WorshipHQ Fingerprint Scanner Agent
====================================
Run this ONCE to install as a background service. After that, it starts
automatically when your computer boots — no manual steps needed.

Supported scanners:
  - ZKTeco (ZK4500, ZK9500, SLK20R) via pyzkfp
  - DigitalPersona U.are.U via dpfpdd

Install & run:
  pip install pyzkfp
  python whq-scanner-agent.py --install
  (That's it — it auto-starts on boot from now on)

Manual run (without installing):
  python whq-scanner-agent.py
"""

import base64
import json
import os
import sys
import time
import struct
import hashlib
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 23847
scanner = None
scanner_type = None

_LOG = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "WorshipHQ", "Scanner", "agent.log")

def log(msg):
    """Print and append to a log file so the hidden (windowless) agent is still
    debuggable — open agent.log in Notepad to see what happened."""
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    try:
        os.makedirs(os.path.dirname(_LOG), exist_ok=True)
        with open(_LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

# ─── Auto-install as Windows startup ─────────────────────

def _startup_dir():
    return os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")

def install_startup():
    """Register to run at login — HIDDEN (no console window) via pythonw + a
    VBS launcher that starts it with window style 0 (invisible)."""
    if sys.platform != "win32":
        print("[INFO] Auto-start install is Windows-only. On Linux, add to systemd.")
        return

    script_path = os.path.abspath(__file__)
    # pythonw.exe runs without a console window (unlike python.exe).
    pythonw = sys.executable.replace("python.exe", "pythonw.exe")
    if not os.path.exists(pythonw):
        pythonw = sys.executable

    startup_dir = _startup_dir()
    # Remove any old visible .bat launcher from a previous version.
    old_bat = os.path.join(startup_dir, "WorshipHQ-Scanner.bat")
    if os.path.exists(old_bat):
        try: os.remove(old_bat)
        except OSError: pass

    # A VBS launcher runs the agent fully hidden (0 = hidden window).
    vbs_path = os.path.join(startup_dir, "WorshipHQ-Scanner.vbs")
    vbs = (
        'Set s = CreateObject("WScript.Shell")\r\n'
        f's.Run """{pythonw}"" ""{script_path}""", 0, False\r\n'
    )
    with open(vbs_path, "w") as f:
        f.write(vbs)

    print(f"[OK] Installed to startup (runs hidden, no window): {vbs_path}")
    print("[OK] The scanner will start automatically and invisibly when you log in.")

def uninstall_startup():
    """Remove from Windows startup (both the old .bat and the .vbs)."""
    if sys.platform != "win32":
        return
    startup_dir = _startup_dir()
    removed = False
    for name in ("WorshipHQ-Scanner.vbs", "WorshipHQ-Scanner.bat"):
        p = os.path.join(startup_dir, name)
        if os.path.exists(p):
            try:
                os.remove(p)
                removed = True
                print(f"[OK] Removed from startup: {p}")
            except OSError:
                pass
    if not removed:
        print("[INFO] Not installed in startup.")


# ─── Scanner backends ──────────────────────────────────────

def _register_sdk_dll_dirs():
    """ZKTeco's libzkfp.dll ships with the ZKFinger/SLK20R SDK, not the plain USB
    driver. Add the usual SDK install folders to the DLL search path so pyzkfp
    can find it without the user tweaking PATH."""
    candidates = [
        r"C:\Program Files\ZKTeco\ZKFinger SDK\lib",
        r"C:\Program Files (x86)\ZKTeco\ZKFinger SDK\lib",
        r"C:\Program Files\ZKFinger SDK",
        r"C:\Program Files (x86)\ZKFinger SDK",
        r"C:\Program Files (x86)\ZKTeco\SLK20R",
        r"C:\Program Files\ZKTeco\SLK20R",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"),
    ]
    for d in candidates:
        if os.path.isdir(d):
            try:
                os.add_dll_directory(d)  # Python 3.8+
            except Exception:
                pass
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def init_zkfp():
    global scanner, scanner_type
    bits = struct.calcsize("P") * 8
    try:
        _register_sdk_dll_dirs()
        from pyzkfp import ZKFP2
        zk = ZKFP2()
        zk.Init()
        count = zk.GetDeviceCount()
        if count == 0:
            print("[WARN] No ZKTeco scanner found (is it plugged in?)")
            return False
        zk.OpenDevice(0)
        # NOTE: zk.Light() spawns a background thread that can race the device
        # startup and raise DeviceNotStartedError — it's purely cosmetic (turns
        # the reader LED), so we skip it to keep the agent clean and reliable.
        scanner = zk
        scanner_type = "zkfp"
        print(f"[OK] ZKTeco scanner connected ({count} device(s))")
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"[WARN] ZKTeco init failed: {e}")
        if "libzkfp" in str(e).lower() or "dll" in str(e).lower():
            print(f"[HINT] Running {bits}-bit Python. ZKTeco's SDK DLLs are 32-bit,")
            print("[HINT] so install the ZKFinger/SLK20R SDK AND use 32-bit Python.")
        return False

def init_dpfp():
    global scanner, scanner_type
    try:
        import dpfpdd
        dev = dpfpdd.open()
        scanner = dev
        scanner_type = "dpfp"
        print("[OK] DigitalPersona scanner connected")
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"[WARN] DigitalPersona init failed: {e}")
        return False

def init_dummy():
    global scanner, scanner_type
    scanner = "dummy"
    scanner_type = "dummy"
    print("[INFO] Running in DEMO mode (no real scanner)")
    return True

def capture_fingerprint():
    if scanner_type == "zkfp":
        try:
            deadline = time.time() + 25  # don't hang forever if no finger
            while time.time() < deadline:
                capture = scanner.AcquireFingerprint()
                if capture:
                    template, img = capture
                    # AcquireFingerprint returns the template as a .NET Array[Byte]
                    # (via pythonnet) — convert to Python bytes before base64.
                    tpl = bytes(template)
                    image = bytes(img) if img is not None else None
                    log(f"captured template ({len(tpl)} bytes)")
                    return {
                        "template": base64.b64encode(tpl).decode(),
                        "image": base64.b64encode(image).decode() if image else None,
                        "quality": 85,
                        "format": "zkfp",
                        "scanner": "ZKTeco",
                    }
                time.sleep(0.1)
            return {"error": "No finger detected — place your finger firmly and try again."}
        except Exception as e:
            log(f"capture error: {e!r}")
            return {"error": str(e)}

    elif scanner_type == "dpfp":
        try:
            fmd = scanner.capture_fmd()
            return {
                "template": base64.b64encode(fmd).decode(),
                "quality": 80,
                "format": "dpfp",
                "scanner": "DigitalPersona",
            }
        except Exception as e:
            return {"error": str(e)}

    elif scanner_type == "dummy":
        ts = str(time.time()).encode()
        fake = hashlib.sha256(ts).digest() * 4
        return {
            "template": base64.b64encode(fake).decode(),
            "quality": 90,
            "format": "raw",
            "scanner": "Demo (simulated)",
        }

    return {"error": "No scanner initialized"}

def match_fingerprints(probe_b64, gallery):
    probe = base64.b64decode(probe_b64)

    if scanner_type == "zkfp":
        best_score = 0
        best_match = None
        for entry in gallery:
            try:
                stored = base64.b64decode(entry["templateData"])
                score = scanner.DBMatch(probe, stored)
                if score > best_score:
                    best_score = score
                    best_match = entry
            except Exception:
                continue
        if best_match and best_score >= 50:
            return {
                "matched": True,
                "personId": best_match["personId"],
                "personName": best_match.get("personName", ""),
                "score": best_score,
            }
        return {"matched": False, "bestScore": best_score}

    elif scanner_type == "dpfp":
        for entry in gallery:
            try:
                stored = base64.b64decode(entry["templateData"])
                if scanner.compare_fmd(probe, stored):
                    return {
                        "matched": True,
                        "personId": entry["personId"],
                        "personName": entry.get("personName", ""),
                        "score": 100,
                    }
            except Exception:
                continue
        return {"matched": False}

    elif scanner_type == "dummy":
        for entry in gallery:
            stored = base64.b64decode(entry["templateData"])
            if probe == stored:
                return {
                    "matched": True,
                    "personId": entry["personId"],
                    "personName": entry.get("personName", ""),
                    "score": 100,
                }
        return {"matched": False}

    return {"matched": False, "error": "No matching engine"}


# ─── HTTP Server ──────────────────────────────────────────

class AgentHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/status":
            # If we're not on a real scanner yet, try again now — so plugging in
            # the reader (or installing its SDK) works without restarting.
            if scanner is None or scanner_type in (None, "dummy"):
                if not init_zkfp():
                    init_dpfp()
            self._json(200, {
                "connected": scanner is not None and scanner_type != "dummy",
                "scanner": scanner_type or "none",
                "python_bits": struct.calcsize("P") * 8,
                "version": "1.1.0",
                "agent": "WorshipHQ Scanner Agent",
            })
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        content_len = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_len)) if content_len > 0 else {}

        if path == "/capture":
            if not scanner:
                self._json(503, {"error": "No scanner connected"})
                return
            result = capture_fingerprint()
            if "error" in result:
                self._json(500, result)
            else:
                self._json(200, result)

        elif path == "/match":
            probe = body.get("probe")
            gallery = body.get("gallery", [])
            if not probe:
                self._json(400, {"error": "probe template required"})
                return
            result = match_fingerprints(probe, gallery)
            self._json(200, result)

        else:
            self._json(404, {"error": "Not found"})

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}")


# ─── Main ─────────────────────────────────────────────────

def main():
    if "--install" in sys.argv:
        # Register hidden auto-start and EXIT — the setup launches the hidden
        # agent separately, so no console window is left running.
        install_startup()
        return
    elif "--uninstall" in sys.argv:
        uninstall_startup()
        return

    print("=" * 50)
    print("  WorshipHQ Fingerprint Scanner Agent v1.0")
    print("=" * 50)
    print()

    if not init_zkfp():
        if not init_dpfp():
            print("[INFO] No hardware scanner found.")
            init_dummy()

    print()
    print(f"Agent ready on http://localhost:{PORT}")
    print(f"Scanner: {scanner_type}")
    print("Press Ctrl+C to stop")
    print()

    server = HTTPServer(("0.0.0.0", PORT), AgentHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        if scanner_type == "zkfp" and scanner:
            try:
                scanner.CloseDevice()
                scanner.Terminate()
            except Exception:
                pass
        server.server_close()

if __name__ == "__main__":
    main()
