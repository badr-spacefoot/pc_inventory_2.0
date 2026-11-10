"""Drive immutable published executables through OS mouse input and screen OCR.

No collector source is downloaded/imported, and no code is injected into the app.
Only disposable GitHub VM jobs may execute this real-hardware acceptance test.
"""
from __future__ import annotations

import csv
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import threading
import time


spec = importlib.util.spec_from_file_location("release_package_helpers", Path(__file__).with_name("collector-release-acceptance.py"))
packages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packages)


class ScreenDriver:
    def __init__(self, root: Path, receipt: dict):
        self.root = root
        self.mac = platform.system() == "Darwin"
        self.helper = root / "native-ui"
        self.last_lines = []
        self.receipt = receipt
        if self.mac:
            packages.run("swiftc", str(Path(__file__).with_name("collector-native-ui.swift")), "-o", str(self.helper))
            receipt["vmDisplay"] = json.loads(subprocess.check_output([str(self.helper), "display"]))
            permissions = json.loads(subprocess.check_output([str(self.helper), "permissions"]))
            receipt["macGuiPermissions"] = permissions
            if not all(permissions.values()):
                raise RuntimeError("macOS VM has not authorized screen capture and GUI events; no permission bypass attempted")

    def observe(self):
        screen = self.root / "screen-private.png"
        if self.mac:
            packages.run("/usr/sbin/screencapture", "-x", str(screen), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return json.loads(subprocess.check_output([str(self.helper), "ocr", str(screen)]))
        packages.run("import", "-window", "root", str(screen), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raw = subprocess.check_output(["tesseract", str(screen), "stdout", "--psm", "11", "tsv"], stderr=subprocess.DEVNULL, text=True)
        return ocr_lines(raw)

    def click(self, line):
        if self.mac:
            packages.run(str(self.helper), "click", str(line["x"]), str(line["y"]))
        else:
            packages.run("xdotool", "mousemove", str(round(line["x"])), str(round(line["y"])), "click", "1")

    def primary_action(self, process):
        # The published two-step UI keeps its primary action at the bottom
        # right. Measure the actual native window, after observing its stage.
        if self.mac:
            bounds = json.loads(subprocess.check_output([str(self.helper), "window", str(process.pid)]))
            x, y, width, height = (bounds[k] for k in ("X", "Y", "Width", "Height"))
        else:
            # The published Linux onefile bootloader runs its UI in a child.
            windows = subprocess.check_output(["xdotool", "search", "--onlyvisible", "--name", "Collector 0.1.58"], text=True).split()
            verified = []
            for window in windows:
                title = subprocess.check_output(["xdotool", "getwindowname", window], text=True).strip()
                owner = subprocess.run(["xdotool", "getwindowpid", window], capture_output=True, text=True)
                if owner.returncode == 0:
                    assert Path(f"/proc/{owner.stdout.strip()}/exe").resolve() == Path("/opt/parceo-collector/parceo-collector")
                # Tk does not always publish _NET_WM_PID without a window
                # manager. This Xvfb display is private to this single test.
                if title == "Parcéo Collector 0.1.58" and process.poll() is None:
                    verified.append(window)
            windows = verified
            assert len(windows) == 1, "Expected one published collector window"
            data = subprocess.check_output(["xdotool", "getwindowgeometry", "--shell", windows[0]], text=True)
            bounds = dict(line.split("=", 1) for line in data.splitlines() if "=" in line)
            x, y, width, height = (int(bounds[k]) for k in ("X", "Y", "WIDTH", "HEIGHT"))
        assert width >= 1040 and height >= 760, "Collector window is unexpectedly small"
        self.click({"x": x + width - 65, "y": y + height - 42})

    def wait_for(self, phrase, process, timeout=75, exact=False):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if process.poll() is not None:
                raise RuntimeError("Published executable exited before GUI acceptance completed")
            lines = self.observe()
            self.last_lines = lines
            # A VM privacy prompt can cover the application. Deny optional LAN
            # discovery rather than broadening access for an inventory test.
            denial = [line for line in lines if normalize(line["text"]).replace("’", "'") == "don't allow"]
            if denial and any("on local networks" in normalize(line["text"]) for line in lines):
                self.click(denial[0])
                self.receipt["optionalLocalNetworkPermission"] = "denied"
                time.sleep(0.5)
                continue
            hits = [line for line in lines if (normalize(line["text"]) == normalize(phrase) if exact else normalize(phrase) in normalize(line["text"]))]
            if hits:
                # Footer action is lower than matching explanatory labels.
                return max(hits, key=lambda line: line["y"])
            time.sleep(0.5)
        raise TimeoutError("Published GUI did not reach expected stage: " + phrase)


def normalize(text):
    return " ".join(text.casefold().split())


def ocr_lines(raw):
    groups = {}
    for row in csv.DictReader(io.StringIO(raw), delimiter="\t"):
        if row["level"] != "5" or not row["text"].strip():
            continue
        key = tuple(row[k] for k in ("page_num", "block_num", "par_num", "line_num"))
        groups.setdefault(key, []).append(row)
    result = []
    for rows in groups.values():
        left = min(int(r["left"]) for r in rows)
        top = min(int(r["top"]) for r in rows)
        right = max(int(r["left"]) + int(r["width"]) for r in rows)
        bottom = max(int(r["top"]) + int(r["height"]) for r in rows)
        result.append({"text": " ".join(r["text"] for r in rows), "x": (left + right) / 2, "y": (top + bottom) / 2})
    return result


def fixture(receipt):
    requests, received, failures = [], [], []
    profile = {"firstName": "VM", "lastName": "Binary Test", "email": "vm@example.invalid", "team": "IT recette", "establishment": "Lab recette", "language": "en"}

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
            if self.path == "/collect/prefill/vm-binary-fixture":
                self.respond({**profile, "apiUrl": endpoint, "accessToken": "vm-binary-access"})
            elif self.path == "/organization":
                self.respond({"teams": [{"name": "IT recette"}], "establishments": [{"name": "Lab recette"}]})
            else:
                self.send_error(404)

        def do_POST(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                assert 0 < size < 2 * 1024 * 1024
                body = json.loads(self.rfile.read(size))
                requests.append(self.path)
                if self.path in ("/collect/profile", "/collect/access-token/validate"):
                    assert self.headers.get("X-Collection-Access-Token") == "vm-binary-access"
                    if self.path == "/collect/profile":
                        assert all(body[k] == profile[k] for k in ("firstName", "lastName", "email", "team", "establishment"))
                    self.respond({"label": "VM binary fixture", "collectionToken": "vm-binary-scan"})
                elif self.path == "/collect/scan":
                    assert self.headers.get("Authorization") == "Bearer vm-binary-scan"
                    assert body["collectorVersion"] == "0.1.58"
                    assert body["collectorBuildChannel"] == "manual-unsigned", "Source or rebuilt collector is forbidden"
                    assert body["collectorPlatform"] == platform.system()
                    assert body["collectorEngine"] == "osquery"
                    assert body["hostname"] and body["cpu"] and body["osName"]
                    assert body["ramTotalGb"] > 0 and body["storageTotalGb"] > 0
                    received.append(True)
                    receipt["receivedInventoryCount"] = len(received)
                    receipt["engine"] = body["collectorEngine"]
                    receipt["collectorBuildChannel"] = body["collectorBuildChannel"]
                    self.respond({"deviceId": "vm-binary-device"})
                else:
                    self.send_error(404)
            except Exception as error:
                failures.append(type(error).__name__)
                self.send_error(400)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    endpoint = f"http://127.0.0.1:{server.server_port}"
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    return server, worker, {"apiUrl": endpoint, "prefillCode": "vm-binary-fixture"}, requests, received, failures


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or platform.system() not in packages.ASSETS:
        raise SystemExit("Binary GUI hardware tests are restricted to disposable CI VMs")
    root = Path(os.environ["PARCEO_ACCEPTANCE_ROOT"])
    root.mkdir(parents=True, exist_ok=False)
    production = os.environ.get("PARCEO_ACCEPTANCE_PRODUCTION") == "1"
    receipt = {"release": "0.1.58", "os": platform.system(), "architecture": platform.machine(),
               "passed": False, "collectorSourceDownloadedOrImported": False,
               "productionInventoryTouched": False, "apiTarget": "Parcéo production" if production else "loopback fixture"}
    process = server = worker = driver = None
    requests = []
    preferences = Path.home() / ".spacefoot_it_collector.json"
    created_preferences = False
    try:
        driver = ScreenDriver(root, receipt)
        package = packages.download(root, packages.ASSETS[platform.system()])
        receipt["publishedDownloadChecksumsVerified"] = True
        osquery = packages.native_package(root, package, receipt)
        binary = Path("/opt/parceo-collector/parceo-collector") if platform.system() == "Linux" else root / "macos/parceo-collector-macos-0.1.58.app/Contents/MacOS/parceo-collector-macos"
        receipt["executableSha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
        requests, received, failures = [], [], []
        if production:
            target = packages.production_context(native=True)
            receipt["productionInventoryTouched"] = True
        else:
            server, worker, target, requests, received, failures = fixture(receipt)
        assert not preferences.exists(), "Disposable VM must have no pre-existing collector preferences"
        preferences.write_text(json.dumps({"autoUpdate": False, "language": "en", "apiUrl": target["apiUrl"],
                                           "themePreferenceExplicit": True, "themePreference": "light", "savedAt": time.time()}), encoding="utf-8")
        created_preferences = True
        env = {k: v for k, v in os.environ.items() if k not in ("SPACEFOOT_COLLECTOR_STARTUP_PROBE", "PYTHONPATH", "PYTHONHOME", "PARCEO_PRODUCTION_INVITE")}
        if platform.system() == "Linux":
            env["SPACEFOOT_OSQUERYI"] = str(osquery)
        with (root / "native-private.log").open("wb") as log:
            process = subprocess.Popen([str(binary), "--api-url", target["apiUrl"], "--prefill-code", target["prefillCode"]], env=env, stdout=log, stderr=log, start_new_session=True)
            if platform.system() == "Darwin":
                time.sleep(3)
                receipt["windowActivation"] = json.loads(subprocess.check_output([str(driver.helper), "activate", str(process.pid)]))
            receipt["phase"] = "prefill"
            driver.wait_for("Profile ready", process)
            driver.primary_action(process)
            receipt["phase"] = "scan"
            driver.wait_for("Hardware scan", process)
            driver.primary_action(process)
            driver.wait_for("Scan completed", process, timeout=180)
            receipt["publishedBinaryHardwareScan"] = True
            receipt["phase"] = "submit"
            driver.primary_action(process)
            driver.wait_for("Submission sent", process, timeout=90)
            receipt["publishedBinarySubmissionSuccessVisible"] = True
            if production:
                for line in driver.last_lines:
                    compact = re.sub(r"\s+", "", line["text"])
                    if compact.casefold().startswith("deviceid:"):
                        identifier = re.search(r"[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", compact)
                        if identifier:
                            receipt["productionDeviceFingerprint"] = hashlib.sha256(identifier[0].lower().encode()).hexdigest()
            assert not failures, "Fixture rejected the native inventory"
            if not production:
                assert len(received) == 1 and requests.count("/collect/scan") == 1
                assert requests.count("/collect/profile") == 1
                receipt["requests"] = requests
                # Synthetic profile and a disposable VM only. Never publish production screens.
                (root / "binary-success.png").write_bytes((root / "screen-private.png").read_bytes())
            receipt["passed"] = True
    except Exception as error:
        receipt["failure"] = type(error).__name__ if production else f"{type(error).__name__}: {error}"
        if not production:
            receipt["requests"] = requests
            if driver:
                receipt["lastScreenText"] = [line["text"] for line in driver.last_lines]
                screen = root / "screen-private.png"
                if screen.exists():
                    (root / "binary-failure.png").write_bytes(screen.read_bytes())
        raise
    finally:
        if process:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        if server:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)
        if created_preferences:
            preferences.unlink(missing_ok=True)
        (root / "result.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
