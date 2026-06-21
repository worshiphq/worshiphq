#!/usr/bin/env python3
"""
WorshipHQ Fingerprint Scanner Agent
====================================
Run this on each check-in computer that has a USB fingerprint scanner.
The WorshipHQ web app communicates with this agent to capture and match fingerprints.

Supported scanners:
  - ZKTeco (ZK4500, ZK9500, SLK20R, etc.) via pyzkfp
  - DigitalPersona U.are.U via dpfpdd
  - Any scanner supported by libfprint (Linux) or Windows Biometric Framework

Usage:
  pip install flask flask-cors pyzkfp
  python whq-scanner-agent.py

The agent runs on http://localhost:23847 by default.
"""

import base64
import json
import sys
import time
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

PORT = 23847
scanner = None
scanner_type = None

# ─── Scanner backends ──────────────────────────────────────

def init_zkfp():
    """Initialize ZKTeco fingerprint scanner."""
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
    """Initialize DigitalPersona scanner."""
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
    """Dummy scanner for testing without hardware."""
    global scanner, scanner_type
    scanner = "dummy"
    scanner_type = "dummy"
    print("[INFO] Running in DEMO mode (no real scanner)")
    print("[INFO] Captures will return simulated fingerprint data")
    return True

def capture_fingerprint():
    """Capture a fingerprint template from the connected scanner."""
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
        # Simulate a unique fingerprint capture for testing
        ts = str(time.time()).encode()
        fake = hashlib.sha256(ts).digest() * 4  # 128 bytes
        return {
            "template": base64.b64encode(fake).decode(),
            "quality": 90,
            "format": "raw",
            "scanner": "Demo (simulated)",
        }

    return {"error": "No scanner initialized"}

def match_fingerprints(probe_b64, gallery):
    """Match a probe fingerprint against a gallery of stored templates.

    For ZKTeco: uses the SDK's built-in matching.
    For others: basic byte comparison (upgrade with SourceAFIS for production).
    """
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

        threshold = 50  # ZKTeco match threshold
        if best_match and best_score >= threshold:
            return {
                "matched": True,
                "personId": best_match["personId"],
                "personName": best_match.get("personName", ""),
                "score": best_score,
                "finger": best_match.get("finger", ""),
            }
        return {"matched": False, "bestScore": best_score}

    elif scanner_type == "dpfp":
        # DigitalPersona SDK matching
        for entry in gallery:
            try:
                stored = base64.b64decode(entry["templateData"])
                if scanner.compare_fmd(probe, stored):
                    return {
                        "matched": True,
                        "personId": entry["personId"],
                        "personName": entry.get("personName", ""),
                        "score": 100,
                        "finger": entry.get("finger", ""),
                    }
            except Exception:
                continue
        return {"matched": False}

    elif scanner_type == "dummy":
        # Demo mode: match by exact byte equality
        for entry in gallery:
            stored = base64.b64decode(entry["templateData"])
            if probe == stored:
                return {
                    "matched": True,
                    "personId": entry["personId"],
                    "personName": entry.get("personName", ""),
                    "score": 100,
                    "finger": entry.get("finger", ""),
                }
        return {"matched": False}

    return {"matched": False, "error": "No matching engine available"}


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
                "connected": scanner is not None,
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
    print("=" * 50)
    print("  WorshipHQ Fingerprint Scanner Agent v1.0")
    print("=" * 50)
    print()

    # Try each scanner backend in order of preference
    if not init_zkfp():
        if not init_dpfp():
            print("[INFO] No hardware scanner SDK found.")
            if "--demo" in sys.argv:
                init_dummy()
            else:
                print("[INFO] Run with --demo flag for testing without a scanner")
                print("[INFO] Install pyzkfp (ZKTeco) or dpfpdd (DigitalPersona) for real scanners")
                print()
                init_dummy()  # Default to demo mode for convenience

    print()
    print(f"Agent listening on http://localhost:{PORT}")
    print(f"Scanner type: {scanner_type}")
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
