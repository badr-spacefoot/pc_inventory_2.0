"""Exercise immutable 0.1.58 downloads on disposable CI VMs, with a loopback API.

Native packages are installed and started. Their exact released source is then
driven through Tk, a real hardware scan, and real HTTP submission to the fixture.
This is deliberately not evidence of a submission to Parcéo production.
"""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import plistlib
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
import zipfile


BASE = "https://github.com/badr-spacefoot/pc_inventory_2.0/releases/download/collector-manual-v0.1.58/"
ASSETS = {
    "Linux": ("parceo-collector-linux-0.1.58.deb", "926c24ea0b21dc73d8e8eb875fdb5333c48733143f403c00b481a56d610bce2a"),
    "Darwin": ("parceo-collector-macos-0.1.58.app.zip", "69a54fe02b0cd340ea01ce5a4bad86c91eef923bb6a82bdd79e474b48204a0be"),
}
SOURCE = ("parceo-collector-source-0.1.58.zip", "a243faed748aa04d91bb31bf45dd334b708e80cb471891442c050ce3ed364b48")
PRODUCTION_API = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"


def production_context() -> dict | None:
    if os.environ.get("PARCEO_ACCEPTANCE_PRODUCTION") != "1":
        return None
    if not (os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and os.environ.get("GITHUB_REPOSITORY") == "badr-spacefoot/pc_inventory_2.0"):
        raise ValueError("Production acceptance requires a manual run of protected main")
    code = os.environ.get("PARCEO_PRODUCTION_INVITE", "")
    if not code.startswith("inv_") or not all(c.isalnum() or c in "_-" for c in code):
        raise ValueError("A dedicated one-use production invitation is required")

    def request(path, body=None):
        req = urllib.request.Request(
            PRODUCTION_API + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"},
        )
        # Never forward an invitation to a redirect destination.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                raise ValueError("Production API redirects are forbidden")
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as response:
            return json.loads(response.read(1024 * 1024))

    path = "/collect/invite/" + urllib.parse.quote(code, safe="")
    invited = request(path)
    assert str(invited.get("label", "")).startswith("RECETTE-VM-"), "Only dedicated VM test invitations are accepted"
    assert invited.get("maxUses") == 1 and invited.get("useCount") == 0, "VM acceptance requires an unused one-use invitation"
    assert invited.get("email"), "Production invitation must have a fixed recipient"
    assert not invited.get("deviceId"), "VM acceptance must not target an existing PC"
    prepared = request(path + "/prefill", {
        "apiUrl": PRODUCTION_API,
        "comment": f"RECETTE VM GitHub Actions {platform.system()} {platform.machine()} run {os.environ.get('GITHUB_RUN_ID')}",
    })
    assert prepared.get("prefillCode"), "Production prefill was not created"
    return {"apiUrl": PRODUCTION_API, "prefillCode": prepared["prefillCode"], "email": invited["email"]}


def run(*args, **kwargs):
    return subprocess.run(args, check=True, timeout=180, **kwargs)


def download(root: Path, asset: tuple[str, str]) -> Path:
    name, digest = asset
    path = root / name
    with urllib.request.urlopen(BASE + name, timeout=90) as response, path.open("xb") as output:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > 256 * 1024 * 1024:
                raise ValueError("Release asset exceeds acceptance size limit")
            output.write(chunk)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError("Published release checksum mismatch")
    return path


def extract_source(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        for entry in archive.infolist():
            name = PurePosixPath(entry.filename)
            if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or entry.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError("Unsafe source archive entry")
        manifest = json.loads(archive.read("SOURCE-MANIFEST.json"))
        if manifest["version"] != "0.1.58":
            raise ValueError("Incorrect released source version")
        for record in manifest["files"]:
            data = archive.read(record["path"])
            if len(data) != record["size"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
                raise ValueError("Released source manifest mismatch")
        archive.extractall(destination)


def native_package(root: Path, package: Path, receipt: dict) -> Path:
    if platform.system() == "Linux":
        run("sudo", "apt-get", "install", "-y", str(package))
        binary = Path("/opt/parceo-collector/parceo-collector")
        installed = subprocess.check_output(["dpkg-query", "-W", "-f=${Version}", "parceo-collector"], text=True).strip()
        assert installed == "0.1.58", "Installed Debian version mismatch"
        desktop = Path("/usr/share/applications/parceo-collector.desktop").read_text()
        assert "x-scheme-handler/parceo-collector" in desktop and "x-scheme-handler/spacefoot-collector" in desktop
        tools = Path(os.environ["RUNNER_TEMP"]) / "acceptance-osquery"
        candidates = list(tools.rglob("osqueryi"))
        assert candidates, "Verified osquery runtime missing"
        # The vendor deb contains /usr/bin links pointing to /opt/osquery.
        osquery = next((p for p in candidates if not p.is_symlink()), candidates[0])
        if osquery.is_symlink():
            target = Path(os.readlink(osquery))
            osquery = tools / str(target).lstrip("/") if target.is_absolute() else osquery.parent / target
        assert osquery.resolve().is_relative_to(tools.resolve()) and osquery.is_file(), "Extracted osquery executable missing or outside package"
    else:
        app = root / "macos" / "parceo-collector-macos-0.1.58.app"
        run("ditto", "-x", "-k", str(package), str(app.parent))
        binary = app / "Contents/MacOS/parceo-collector-macos"
        with (app / "Contents/Info.plist").open("rb") as handle:
            plist = plistlib.load(handle)
        assert plist["CFBundleDisplayName"] == "Parcéo Collector"
        schemes = {s for entry in plist["CFBundleURLTypes"] for s in entry["CFBundleURLSchemes"]}
        assert {"parceo-collector", "spacefoot-collector"} <= schemes
        run("codesign", "--verify", "--deep", "--strict", str(app))
        assessment = subprocess.run(["spctl", "--assess", "--type", "execute", str(app)], capture_output=True, timeout=30)
        receipt["gatekeeperAssessmentExitCode"] = assessment.returncode
        receipt["userGatekeeperApprovalTested"] = False
        osquery = app / "Contents/Frameworks/osquery.app/Contents/MacOS/osqueryd"
        assert osquery.is_file(), "Intact macOS osquery bundle missing"
    actual = subprocess.check_output([str(binary), "--version"], text=True, timeout=40).strip()
    assert actual == "0.1.58", "Native executable version mismatch"
    run(str(binary), env={**os.environ, "SPACEFOOT_COLLECTOR_STARTUP_PROBE": "1"})
    receipt["publishedNativePackageStartup"] = True
    return osquery


def source_ui_roundtrip(source: Path, osquery: Path, receipt: dict, target: dict | None = None) -> None:
    os.environ["SPACEFOOT_COLLECTOR_STARTUP_PROBE"] = "1"
    os.environ["SPACEFOOT_OSQUERYI"] = str(osquery)
    sys.path.insert(0, str(source))
    requests = []
    received = []
    failures = []
    access = "vm-fixture-access"
    scan_token = "vm-fixture-scan"
    profile = {"firstName": "VM", "lastName": "Recette", "email": "vm@example.invalid", "team": "IT recette", "establishment": "Lab recette"}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def respond(self, data):
            raw = json.dumps(data).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            requests.append(self.path)
            if self.path == "/collect/prefill/vm-fixture":
                self.respond({**profile, "apiUrl": endpoint, "accessToken": access})
            elif self.path == "/organization":
                self.respond({"teams": [{"name": "IT recette"}], "establishments": [{"name": "Lab recette"}]})
            else:
                self.send_error(404)

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                assert 0 < length < 2 * 1024 * 1024
                data = json.loads(self.rfile.read(length))
                requests.append(self.path)
                if self.path in ("/collect/access-token/validate", "/collect/profile"):
                    assert self.headers.get("X-Collection-Access-Token") == access
                    if self.path == "/collect/profile":
                        assert all(data[key] == value for key, value in profile.items())
                    self.respond({"label": "VM fixture", "collectionToken": scan_token})
                elif self.path == "/collect/scan":
                    assert self.headers.get("Authorization") == f"Bearer {scan_token}"
                    assert data["collectorVersion"] == "0.1.58"
                    assert data["collectorPlatform"] == platform.system()
                    assert data["hostname"] and data["cpu"] and data["osName"]
                    assert data["ramTotalGb"] > 0 and data["storageTotalGb"] > 0
                    received.append(data)
                    self.respond({"deviceId": "vm-fixture-device"})
                else:
                    self.send_error(404)
            except Exception as error:
                failures.append(type(error).__name__)
                self.send_error(400)

    server = None if target else ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    endpoint = target["apiUrl"] if target else f"http://127.0.0.1:{server.server_port}"
    worker = None if target else threading.Thread(target=server.serve_forever, daemon=True)
    if worker:
        worker.start()
    config = importlib.import_module("collectors.desktop_collector.config")
    config.DEFAULT_API_URL = endpoint
    config.DRAFT_PATH = source / "fixture-preferences.json"
    module = importlib.import_module("collectors.desktop_collector.collector_app")
    prefill = importlib.import_module("collectors.desktop_collector.prefill")
    original_api = module.api_request

    def loopback_api(url, path, **kwargs):
        assert url == endpoint, "Acceptance API destination changed"
        if target:
            assert endpoint == PRODUCTION_API
            assert path == "/organization" or path in ("/collect/profile", "/collect/scan", "/collect/access-token/validate") or path.startswith("/collect/prefill/")
            requests.append("/collect/prefill/[redacted]" if path.startswith("/collect/prefill/") else path)
        return original_api(url, path, **kwargs)

    module.api_request = loopback_api
    prefill.api_request = loopback_api
    app = module.CollectorApp()
    app.withdraw()
    assert app.api_url.get() == endpoint, "Released source initialized with a non-fixture endpoint"
    assert module.COLLECTOR_VERSION == "0.1.58", "Wrong source imported by acceptance"
    app.prefill_code.set(target["prefillCode"] if target else "vm-fixture")
    phase = "prefill"
    receipt["requests"] = requests

    def poll():
        nonlocal phase
        try:
            receipt["phase"] = phase
            if not target:
                receipt["uiStatus"] = app.status.get()
                receipt["connectionStatus"] = app.connection_status.get()
            assert not failures, "Loopback fixture rejected a request"
            assert app.callback_exception_count == 0, "Tk callback failed"
            if phase == "prefill" and (bool(app.access_token.get()) if target else app.access_token.get() == access):
                phase = "organization"
                app.validate_token()
            elif phase == "organization" and app.teams:
                assert app.profile_body()["email"] == (target["email"] if target else profile["email"])
                phase = "scan"
                app.scan_computer()
            elif phase == "scan" and app.payload:
                phase = "submit"
                app.submit_inventory()
            elif phase == "submit" and app.submitted:
                if target:
                    assert app.submission_device_id, "Production did not return a device identifier"
                    receipt["productionDeviceFingerprint"] = hashlib.sha256(app.submission_device_id.encode()).hexdigest()
                else:
                    assert app.submission_device_id == "vm-fixture-device"
                    assert len(received) == 1
                assert requests.count("/collect/profile") == 1
                assert requests.count("/collect/scan") == 1
                receipt.update({"releasedSourceUiRoundtrip": True, "realVmHardwareScanned": True,
                                "apiTarget": "Parcéo production" if target else "loopback fixture", "receivedInventoryCount": 1,
                                "engine": app.payload.get("collectorEngine"), "requests": requests,
                                "callbackExceptions": app.callback_exception_count})
                app.destroy()
                return
            app.after(100, poll)
        except Exception as error:
            failures.append(str(error))
            app.destroy()

    def timeout():
        failures.append(f"Released source UI acceptance timed out in {phase}")
        app.destroy()

    app.after(100, app.load_prefill)
    app.after(200, poll)
    app.after(180000, timeout)
    try:
        app.mainloop()
        assert not failures, "; ".join(failures)
        assert receipt.get("releasedSourceUiRoundtrip"), "Submission did not complete"
    finally:
        receipt["fixtureFailures"] = failures
        if server:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or platform.system() not in ASSETS:
        raise SystemExit("Real VM scanning is restricted to the disposable CI acceptance jobs")
    root = Path(os.environ["PARCEO_ACCEPTANCE_ROOT"])
    root.mkdir(parents=True, exist_ok=False)
    receipt = {"release": "0.1.58", "os": platform.system(), "architecture": platform.machine(),
               "productionInventoryTouched": False, "passed": False}
    try:
        package = download(root, ASSETS[platform.system()])
        source_archive = download(root, SOURCE)
        receipt["publishedDownloadChecksumsVerified"] = True
        source = root / "released-source"
        extract_source(source_archive, source)
        osquery = native_package(root, package, receipt)
        receipt["productionInventoryTouched"] = os.environ.get("PARCEO_ACCEPTANCE_PRODUCTION") == "1"
        target = production_context()
        source_ui_roundtrip(source, osquery, receipt, target)
        receipt["passed"] = True
    except Exception as error:
        receipt["failure"] = type(error).__name__ if receipt["productionInventoryTouched"] else f"{type(error).__name__}: {error}"
        raise
    finally:
        (root / "result.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
