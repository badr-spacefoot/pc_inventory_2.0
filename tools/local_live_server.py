from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import argparse
import json
import mimetypes


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DEFAULT_API = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"


class LocalLiveHandler(SimpleHTTPRequestHandler):
    api_base_url = DEFAULT_API
    static_root = FRONTEND

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, x-collection-access-token")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy_api()
            return
        self.serve_static()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy_api()
            return
        self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.proxy_api()
            return
        self.send_error(404)

    def serve_static(self):
        path = self.path.split("?", 1)[0]
        if path in ("", "/"):
            path = "/index.html"
        target = (self.static_root / path.lstrip("/")).resolve()
        if not str(target).startswith(str(self.static_root.resolve())) or not target.exists() or target.is_dir():
            self.send_error(404)
            return

        if target.name == "index.html":
            html = target.read_text(encoding="utf-8")
            config = (
                "<script>\n"
                "  window.IT_INVENTORY_API_URL = '/api';\n"
                "  window.IT_INVENTORY_LOCAL_LIVE = true;\n"
                "</script>\n"
            )
            html = html.replace("<link rel=\"stylesheet\" href=\"./styles.css\" />", config + "    <link rel=\"stylesheet\" href=\"./styles.css\" />")
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_api(self):
        target_path = self.path.removeprefix("/api")
        target_url = f"{self.api_base_url}{target_path}"
        body = None
        if self.command in {"POST", "DELETE"}:
            length = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(length) if length else None

        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() in {"authorization", "content-type", "origin", "x-collection-access-token"}
        }
        request = Request(target_url, data=body, headers=headers, method=self.command)
        try:
            with urlopen(request, timeout=30) as response:
                response_body = response.read()
                self.send_response(response.status)
                self.forward_headers(response.headers, response_body)
                self.wfile.write(response_body)
        except HTTPError as error:
            response_body = error.read()
            self.send_response(error.code)
            self.forward_headers(error.headers, response_body)
            self.wfile.write(response_body)
        except Exception as error:
            response_body = json.dumps({"error": f"Proxy local indisponible: {error}"}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            self.wfile.write(response_body)

    def forward_headers(self, headers, body):
        content_type = headers.get("Content-Type") or "application/json; charset=utf-8"
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the Spacefoot IT frontend locally with live Supabase data.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--api", default=DEFAULT_API)
    args = parser.parse_args()

    LocalLiveHandler.api_base_url = args.api.rstrip("/")
    server = ThreadingHTTPServer((args.host, args.port), LocalLiveHandler)
    print(f"Local live app: http://{args.host}:{args.port}/")
    print(f"Proxying API to: {LocalLiveHandler.api_base_url}")
    server.serve_forever()


if __name__ == "__main__":
    main()
