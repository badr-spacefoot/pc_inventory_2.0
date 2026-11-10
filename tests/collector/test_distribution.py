import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import zipfile


def load_script(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CollectorDistributionTests(unittest.TestCase):
    def test_windows_resource_contains_the_release_version_and_parceo_identity(self):
        script = load_script("windows_version", "scripts/prepare-windows-version.py")
        resource = script.version_resource("0.1.58")
        fields = {}
        namespace = {name: lambda *args, **kwargs: (args, kwargs)
                     for name in ("VSVersionInfo", "FixedFileInfo", "StringFileInfo", "StringTable", "StringStruct", "VarFileInfo", "VarStruct")}
        namespace["StringStruct"] = lambda key, value: fields.update({key: value})
        tree = eval(resource, {"__builtins__": {}}, namespace)
        self.assertEqual(tree[1]["ffi"][1]["filevers"], (0, 1, 58, 0))
        self.assertEqual(fields["ProductName"], "Parcéo Collector")
        self.assertEqual(fields["OriginalFilename"], "parceo-collector-windows.exe")
        self.assertEqual(fields["ProductVersion"], "0.1.58")
        with self.assertRaises(ValueError):
            script.version_resource("0.1.58';evil")

    def test_macos_frozen_collector_finds_intact_vendor_bundle(self):
        script = load_script("macos_bundle_test", "scripts/collect-cross-platform.py")
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "osquery.app/Contents/MacOS/osqueryd"
            executable.parent.mkdir(parents=True)
            executable.write_bytes(b"synthetic-native-executable")
            with patch.object(script.sys, "frozen", True, create=True), patch.object(script.sys, "_MEIPASS", directory, create=True), patch.object(script.platform, "system", return_value="Darwin"), patch.dict(script.os.environ, {"SPACEFOOT_OSQUERYI": ""}):
                self.assertEqual(script.find_osqueryi(), str(executable))

    def test_osqueryd_is_invoked_in_interactive_mode(self):
        script = load_script("macos_interactive_test", "scripts/collect-cross-platform.py")
        with patch.object(script, "run", return_value="[]") as execute:
            self.assertEqual(script.osquery_json("/bundle/osqueryd", "select 1;"), [])
            execute.assert_called_once_with(["/bundle/osqueryd", "-S", "--json", "select 1;"], timeout=12)

    def test_source_package_has_only_reviewable_files_and_verified_checksums(self):
        packaging = load_script("source_packaging", "scripts/package-collector-source.py")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "source.zip"
            receipt = packaging.package(output)
            with zipfile.ZipFile(output) as archive:
                manifest = json.loads(archive.read("SOURCE-MANIFEST.json"))
                self.assertEqual(manifest["channel"], "source")
                self.assertFalse(manifest["signedInstaller"])
                self.assertEqual(set(archive.namelist()), set(packaging.FILES) | {"SOURCE-MANIFEST.json", "README.txt"})
                for record in manifest["files"]:
                    data = archive.read(record["path"])
                    self.assertEqual(len(data), record["size"])
                    self.assertEqual(hashlib.sha256(data).hexdigest(), record["sha256"])
                config = archive.read("collectors/desktop_collector/config.py").decode()
                self.assertIn('UPDATE_PUBLIC_KEY = ""', config)
                self.assertIn('COLLECTOR_BUILD_CHANNEL = "source"', config)
            self.assertEqual(receipt["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            with self.assertRaises(FileExistsError):
                packaging.package(output)

    def test_script_upload_redirect_does_not_forward_bearer_credentials(self):
        script = load_script("collector_redirect_test", "scripts/collect-cross-platform.py")
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                requests.append((self.path, self.headers.get("Authorization")))
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{self.server.server_port}/redirected")
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                requests.append((self.path, self.headers.get("Authorization")))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            endpoint = f"http://127.0.0.1:{server.server_port}"
            with patch.object(script.sys, "argv", ["collector", "--api-url", endpoint, "--token", "synthetic-token"]), patch.object(script, "collect", return_value={}), self.assertRaises(SystemExit) as stopped:
                script.main()
            self.assertEqual(stopped.exception.code, 1)
            self.assertEqual(requests, [("/collect/scan", "Bearer synthetic-token")])
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
