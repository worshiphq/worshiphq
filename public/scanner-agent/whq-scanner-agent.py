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
import hashlib
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 23847
scanner = None
scanner_type = None

# ─── Auto-install as Windows startup ─────────────────────

def install_startup():
    """Add this script to Windows startup so it runs automatically on boot."""
    if sys.platform != "win32":
        print("[INFO] Auto-start install is Windows-only. On Linux, add to systemd.")
        return

    script_path = os.path.abspath(__file__)
    python_path = sys.executable
    bat_content = f'@echo off\nstart /min "" "{python_path}" "{script_path}"\n'

    startup_dir = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
    bat_path = os.path.join(startup_dir, "WorshipHQ-Scanner.bat")

    with open(bat_path, "w") as f:
        f.write(bat_content)

    print(f"[OK] Installed to Windows startup: {bat_path}")
    print("[OK] The scanner agent will now start automatically when you log in.")
    print("[OK] Starting agent now...\n")

def uninstall_startup():
    """Remove from Windows startup."""
    if sys.platform != "win32":
        return
    startup_dir = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
    bat_path = os.path.join(startup_dir, "WorshipHQ-Scanner.bat")
    if os.path.exists(bat_path):
        os.remove(bat_path)
        print(f"[OK] Removed from startup: {bat_path}")
    else:
        print("[INFO] Not installed in startup.")


# ─── Scanner backends ──────────────────────────────────────

def init_zkfp():
    global scanner, scanner_type
    try:
        from pyzkfp import ZKFP2
        zk = ZKFP2()
        zk.Init()
        count = zk.GetDeviceCount()
        if count == 0:
            print("[WARN] No ZKTeco scanner found")
            return False
        zk.OpenDevice(0)
        zk.Light("green")
        scanner = zk
        scanner_type = "zkfp"
        print(f"[OK] ZKTeco scanner connected ({count} device(s))")
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"[WARN] ZKTeco init failed: {e}")
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
            while True:
                capture = scanner.AcquireFingerprint()
                if capture:
                    template, img = capture
                    return {
                        "template": base64.b64encode(template).decode(),
                        "image": base64.b64encode(img).decode() if img else None,
                        "quality": 85,
                        "format": "zkfp",
                        "scanner": "ZKTeco",
                    }
                time.sleep(0.1)
        except Exception as e:
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
            self._json(200, {
                "connected": scanner is not None and scanner_type != "dummy",
                "scanner": scanner_type or "none",
                "version": "1.0.0",
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
        install_startup()
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
            scanner.CloseDevice()
            scanner.Terminate()
        server.server_close()

if __name__ == "__main__":
    main()
