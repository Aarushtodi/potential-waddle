#!/usr/bin/env python3
"""Grade App preview on REAL HAC grades, on this Mac only.

    python3 local/real_server.py        then open http://localhost:8812

Serves the preview from this folder and two extra paths:
  GET  /real-data.json    last good pull (404 = the preview falls back to sample data)
  GET  /real-status.json  state of the last Reload: ok | login | page_changed | wrong_quarter |
                          network | cooldown, plus a message and when
  POST /api/refresh       one fresh HAC login + read, through ~/bin/hac_grades.py

Rules (Grade App Keep Scope, "Real HAC data in the web preview"):
  - The password never leaves this Mac. It stays in ~/.hac, read by hac_grades.py.
  - Scores live only in ~/.hac/grade-preview/ (chmod 700), never in this repo, git or logs.
  - Reload only, at most once a minute. No automatic retries.
  - After HAC rejects the saved login, no more logins until ~/.hac/password changes.
  - A failed pull never deletes or overwrites the last good copy.
  - Q2 only: if HAC's selected run is not 2, nothing is saved.
  - Listens on 127.0.0.1 only.
"""
import json
import os
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path.home() / "bin"))
import hac_grades  # noqa: E402

PORT = int(os.environ.get("PORT", "8812"))
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path.home() / ".hac" / "grade-preview"
DATA = DATA_DIR / "real-data.json"
STATUS = DATA_DIR / "real-status.json"
PASSWORD_FILE = Path.home() / ".hac" / "password"
COOLDOWN_S = 60

lock = threading.Lock()


def read_status():
    try:
        return json.loads(STATUS.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def write_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def password_mtime():
    try:
        return PASSWORD_FILE.stat().st_mtime
    except FileNotFoundError:
        return None


def refresh():
    """One pull, if the rules allow it. Returns the new status dict."""
    with lock:
        status = read_status()
        now = time.time()
        if status.get("kind") == "login" and status.get("passwordMtime") == password_mtime():
            # Same password HAC already rejected: never send it again.
            return dict(status, refused=True)
        wait = COOLDOWN_S - (now - status.get("triedAt", 0))
        if wait > 0:
            return dict(status, refused=True, waitSeconds=int(wait) + 1)
        try:
            data = hac_grades.pull_structured()
        except hac_grades.PullError as error:
            status = {"kind": error.kind, "message": str(error), "triedAt": now,
                      "passwordMtime": password_mtime(), "pulledAt": status.get("pulledAt")}
        except Exception as error:  # anything unexpected reads as a page change; the last copy stays
            print("pull error:", type(error).__name__, file=sys.stderr, flush=True)  # type only, no values
            status = {"kind": "page_changed", "message": "HAC looks different.", "triedAt": now,
                      "pulledAt": status.get("pulledAt")}
        else:
            data["pulledAt"] = now
            write_json(DATA, data)
            status = {"kind": "ok", "message": "", "triedAt": now, "pulledAt": now}
        write_json(STATUS, status)
        return status


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):
        pass  # no request log at all, so nothing about grades can land in one

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/real-data.json":
            if not DATA.exists():
                return self.send_json(404, {})
            return self.send_json(200, json.loads(DATA.read_text()))
        if path == "/real-status.json":
            return self.send_json(200, read_status())
        if path.startswith("/local/"):
            return self.send_json(404, {})
        if path in ("/", "/index.html"):
            # The deployed page allows no network at all. Only here, on this Mac, may it fetch
            # from its own origin (real-data.json, api/refresh). The file on disk is unchanged.
            page = (ROOT / "index.html").read_text().replace(
                "default-src 'none';", "default-src 'none'; connect-src 'self';", 1).replace(
                "<head>", '<head>\n  <meta name="real-hac" content="local">', 1)
            raw = page.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/refresh":
            return self.send_json(404, {})
        # Only this page may ask: a browser tab on another site can't trigger HAC logins.
        origin = self.headers.get("Origin", "")
        if origin and origin not in (f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"):
            return self.send_json(403, {})
        status = refresh()
        return self.send_json(200, {k: v for k, v in status.items() if k != "passwordMtime"})


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(DATA_DIR, 0o700)
    if not DATA.exists() and read_status().get("kind") != "login":
        print("No saved pull yet, reading HAC once...", flush=True)
        result = refresh()
        print("  ->", result.get("kind"), "(waiting on the 1 minute limit)" if result.get("refused") else "", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Grade App preview on real HAC grades: http://localhost:{PORT}  (Ctrl+C to stop)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
