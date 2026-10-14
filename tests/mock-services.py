"""Local stand-in for the email API (Resend) and a CRM webhook receiver, for end-to-end tests.

    python3 tests/mock-services.py 4555 /tmp/mock-log.jsonl

POST /emails  -> 200, logged as {"kind": "email", ...}
POST /hook    -> 200, logged as {"kind": "webhook", ...}
POST /fail    -> 500 (to exercise webhook retries)
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4555
LOG = sys.argv[2] if len(sys.argv) > 2 else "mock-log.jsonl"


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0))).decode()
        kind = {"/emails": "email", "/hook": "webhook", "/fail": "fail"}.get(self.path, "other")
        with open(LOG, "a") as f:
            f.write(json.dumps({"kind": kind, "headers": dict(self.headers), "body": json.loads(body or "{}")}) + "\n")
        self.send_response(500 if kind == "fail" else 200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"id":"mock"}')

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
