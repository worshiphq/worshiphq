#!/usr/bin/env python3
"""
WorshipHQ Device Bridge
=======================
For face, palm and fingerprint devices that can only send their scans to an IP address
over plain HTTP (they cannot use a web address or HTTPS). Run this on a computer that is on
the same network (the same Wi-Fi or router) as the device. The device sends its scans to this
computer, and this program passes them on, securely, to WorshipHQ.

How to use it
  1. Install Python 3 from python.org if you do not have it (tick "Add Python to PATH").
  2. Double-click whq-device-bridge.bat (or run:  python whq-device-bridge.py).
  3. It prints the address to type into the device. On the device, set the cloud server
     address to that IP and the port shown (8081), with HTTPS switched OFF.
  4. Leave the window open while people arrive. The computer must stay on.

It only passes on the device's own messages (addresses starting with /iclock/) and nothing else.
No scans or names are stored on this computer, and nothing is printed except the time, the request
and whether it worked. Python's standard library only, nothing to install.
"""
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("WHQ_UPSTREAM", "https://worshiphq.app").rstrip("/")
PORT = int(os.environ.get("WHQ_PORT", "8081"))
ALLOWED_PREFIX = "/iclock/"
TIMEOUT = 25
VERSION = "1"


def local_addresses():
    """The addresses of this computer on the network, to type into the device."""
    found = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # no data is sent; this only picks the right network card
        found.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                found.add(ip)
    except OSError:
        pass
    return sorted(found)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "WorshipHQ-Bridge/" + VERSION

    def _reply(self, status, body=b"", ctype="text/plain"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _forward(self):
        started = time.time()
        if not self.path.startswith(ALLOWED_PREFIX):
            self._reply(404, b"Not found")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length > 0 else None
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method=self.command)
        ctype = self.headers.get("Content-Type")
        if ctype:
            req.add_header("Content-Type", ctype)
        req.add_header("User-Agent", "WorshipHQ-Device-Bridge/" + VERSION)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                status, data, out_type = r.status, r.read(), r.headers.get("Content-Type", "text/plain")
        except urllib.error.HTTPError as e:  # WorshipHQ answered with an error: pass it on as it is
            status, data, out_type = e.code, e.read(), e.headers.get("Content-Type", "text/plain")
        except Exception as e:  # no internet, or WorshipHQ unreachable: the device will try again later
            self._reply(503, b"Bridge could not reach WorshipHQ")
            self._log(503, started, "could not reach WorshipHQ (%s)" % type(e).__name__)
            return
        self._reply(status, data, out_type)
        self._log(status, started)

    def _log(self, status, started, note=""):
        path = self.path.split("?")[0]
        print("%s  %s %s -> %s  (%d ms) %s" % (time.strftime("%H:%M:%S"), self.command, path, status, (time.time() - started) * 1000, note), flush=True)

    do_GET = _forward
    do_POST = _forward

    def log_message(self, *args):  # we print our own, shorter line
        pass


def main():
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as e:
        print("Could not start on port %d (%s). Is the bridge already running?" % (PORT, e))
        sys.exit(1)
    print("WorshipHQ Device Bridge is running. Keep this window open.")
    print("Passing scans on to: " + UPSTREAM)
    print("")
    print("On the device, set the cloud server address to ONE of these, port %d, HTTPS off:" % PORT)
    for ip in local_addresses():
        print("    " + ip)
    print("")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
