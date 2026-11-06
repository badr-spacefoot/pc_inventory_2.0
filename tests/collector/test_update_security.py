import base64
import ast
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import time
import subprocess
import sys
import unittest
from unittest.mock import patch
import zipfile

from collectors.desktop_collector import support
from collectors.desktop_collector.prefill import PrefillMixin
from collectors.desktop_collector.update_security import extract_app_archive, verify_download, verify_manifest, https_url, release_asset
from tests.collector.test_workflows import Value
from tests.collector.test_workflows import UpdateHarness


class SecurityTests(unittest.TestCase):
    def collector_method(self, name, namespace=None):
        tree = ast.parse(Path("collectors/desktop_collector/collector_app.py").read_text(encoding="utf-8"))
        cls = next(item for item in tree.body if isinstance(item, ast.ClassDef) and item.name == "CollectorApp")
        method = next(item for item in cls.body if isinstance(item, ast.FunctionDef) and item.name == name)
        scope = namespace if namespace is not None else {}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "collector-method", "exec"), scope)
        return scope[name]

    def test_rejects_unconfigured_signing_trust(self):
        with self.assertRaises(ValueError):
            verify_manifest({}, "")

    def test_real_signatures_tampering_and_expiry(self):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        from cryptography.exceptions import InvalidSignature
        key = Ed25519PrivateKey.generate()
        public = base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
        manifest = {"expiresAt": time.time() + 300, "latestVersion": "1.2.3"}
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
        envelope = {"manifest": manifest, "signature": base64.b64encode(key.sign(payload)).decode()}
        self.assertEqual(verify_manifest(envelope, public), manifest)
        manifest["latestVersion"] = "9.9.9"
        with self.assertRaises(InvalidSignature):
            verify_manifest(envelope, public)
        manifest["expiresAt"] = 0
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
        envelope["signature"] = base64.b64encode(key.sign(payload)).decode()
        with self.assertRaises(ValueError):
            verify_manifest(envelope, public)

    def test_checksum_rejects_modified_package(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "update"
            path.write_bytes(b"safe")
            asset = {"size": 4, "sha256": hashlib.sha256(b"safe").hexdigest()}
            verify_download(path, asset)
            path.write_bytes(b"evil")
            with self.assertRaises(ValueError):
                verify_download(path, asset)

    def test_rejects_unsafe_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            stream = io.BytesIO()
            with zipfile.ZipFile(stream, "w") as archive:
                archive.writestr("../escape", "unsafe")
            stream.seek(0)
            with zipfile.ZipFile(stream) as archive, self.assertRaises(ValueError):
                extract_app_archive(archive, Path(directory))

    def test_https_enforced_except_api_loopback(self):
        for url in ["http://parc.piqa.fr", "file:///tmp/test", "https://user:pass@example.com"]:
            with self.assertRaises(ValueError):
                support.normalize_api_url(url)
            with self.assertRaises(ValueError):
                https_url(url)
        self.assertEqual(support.normalize_api_url("http://127.0.0.1:8000/api"), "http://127.0.0.1:8000/api")

    def test_draft_never_persists_secrets_or_personal_fields(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(support, "DRAFT_PATH", Path(directory) / "draft"):
            support.save_draft({"accessToken": "secret", "email": "test@example.invalid", "apiUrl": "https://parc.piqa.fr/api"})
            saved = json.loads(support.DRAFT_PATH.read_text())
            self.assertNotIn("accessToken", saved)
            self.assertNotIn("email", saved)
            saved["savedAt"] = 0
            support.DRAFT_PATH.write_text(json.dumps(saved))
            self.assertEqual(support.load_draft(), {})

    def test_delayed_prefill_failure_keeps_error_message(self):
        app = type("Harness", (PrefillMixin,), {})()
        app.api_url, app.prefill_code, app.status = Value("https://example.invalid"), Value("code"), Value()
        callbacks = []
        app.after = lambda delay, callback: callbacks.append(callback)
        with patch("collectors.desktop_collector.prefill.api_request", side_effect=RuntimeError("offline")):
            app._load_prefill_background()
        callbacks[0]()
        self.assertEqual(app.status.get(), "offline")

    def test_windows_update_preserves_full_launch_endpoint(self):
        app = UpdateHarness()
        app.status = Value()
        app.t = lambda text: text
        app.after = lambda *args: None
        app.destroy = lambda: None
        with patch("collectors.desktop_collector.prefill_update.messagebox.showinfo"), patch("collectors.desktop_collector.prefill_update.subprocess.Popen") as launch:
            app.install_update_and_relaunch(Path("installer.exe"))
        command = launch.call_args.args[0]
        self.assertTrue(any(arg.startswith("/LaunchUrl=") and "apiUrl=http%3A%2F%2F127.0.0.1" in arg for arg in command))

    def test_untrusted_manifest_keeps_current_collector_usable(self):
        app = UpdateHarness()
        app.status = Value()
        app.t = lambda text: text
        callbacks = []
        app.after = lambda delay, callback: callbacks.append(callback)
        app.load_prefill = lambda: app.status.set("prefill loaded")
        with patch("collectors.desktop_collector.prefill_update.fetch_json_url") as fetch, patch("collectors.desktop_collector.prefill_update.UPDATE_PUBLIC_KEY", ""), patch("collectors.desktop_collector.prefill_update.download_file") as download:
            app._check_update_then_load_prefill_background()
        self.assertFalse(fetch.called)
        self.assertFalse(download.called)
        for callback in callbacks:
            callback()
        self.assertEqual(app.status.get(), "prefill loaded")

    def test_signed_asset_metadata_cannot_escape_the_download_directory(self):
        asset = {"fileName": "collector.exe", "size": 4, "sha256": hashlib.sha256(b"safe").hexdigest(), "downloadUrl": "https://example.invalid/collector.exe"}
        manifest = {"latestVersion": "collector-v1.2.3", "assets": {"windows": asset}}
        self.assertEqual(release_asset(manifest, "windows"), asset)
        for name in ["..", "../collector.exe", "C:\\collector.exe", "collector.exe/other", "collector.deb", "$(id).exe"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                release_asset({**manifest, "assets": {"windows": {**asset, "fileName": name}}}, "windows")
        for size in [True, -1, 0, 513 * 1024**2, "4"]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                release_asset({**manifest, "assets": {"windows": {**asset, "size": size}}}, "windows")

    def test_macos_target_cannot_escape_applications(self):
        app = UpdateHarness()
        with self.assertRaises(ValueError):
            app.macos_target_app_path("x/../../outside")
        self.assertEqual(app.macos_target_app_path("collector-v1.2.3").name, "spacefoot-it-collector-macos-1.2.3.app")

    def test_api_response_is_bounded_before_json_parsing(self):
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b" " * (8 * 1024**2 + 1)
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(support.urllib.request, "build_opener", return_value=opener), self.assertRaisesRegex(ValueError, "size limit"):
            support.api_request("https://example.invalid/api", "/organization")

    def test_build_configuration_requires_only_public_key(self):
        script = Path("scripts/prepare-collector-release.py").resolve()
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "collectors/desktop_collector/config.py"
            config.parent.mkdir(parents=True)
            config.write_text('UPDATE_PUBLIC_KEY = ""\nCOLLECTOR_VERSION = "0.0.0"\n')
            public = base64.b64encode(bytes(range(32))).decode()
            env = {key: value for key, value in os.environ.items() if key != "COLLECTOR_UPDATE_PRIVATE_KEY"}
            env.update(COLLECTOR_UPDATE_PUBLIC_KEY=public, GITHUB_REF_NAME="collector-v1.2.3")
            subprocess.run([sys.executable, str(script), "configure"], cwd=directory, env=env, check=True, capture_output=True)
            self.assertIn(public, config.read_text())
            self.assertIn('COLLECTOR_VERSION = "1.2.3"', config.read_text())

    def test_update_redirect_rejects_http_downgrade(self):
        import urllib.request
        request = urllib.request.Request("https://github.com/example")
        with self.assertRaises(ValueError):
            support.HttpsUpdateRedirect().redirect_request(request, None, 302, "Found", {}, "http://example.com/package")
        redirected = support.HttpsUpdateRedirect().redirect_request(request, None, 302, "Found", {}, "https://release-assets.githubusercontent.com/package")
        self.assertEqual(redirected.full_url, "https://release-assets.githubusercontent.com/package")

    def test_endpoint_change_clears_profile_credentials(self):
        app = type("Harness", (), {})()
        app.api_url = Value("https://parc-api.piqa.fr/api")
        app._profile_api_url = "https://old.example/api"
        fields = ("access_token", "prefill_code", "first_name", "last_name", "email", "team", "establishment", "proposed_team", "proposed_establishment", "comment")
        for name in fields:
            setattr(app, name, Value("old-server-data"))
        self.collector_method("reset_profile_on_endpoint_change")(app)
        self.assertTrue(all(getattr(app, name).get() == "" for name in fields))
        self.assertEqual(app.payload, {})
        self.assertEqual(app.launch_prefill_url, "")

    def test_submission_does_not_forward_token_after_endpoint_change(self):
        app = type("Harness", (), {})()
        app.api_url = Value("https://old.example/api")
        calls = []
        def request(endpoint, path, **kwargs):
            calls.append((endpoint, path, kwargs))
            app.api_url.set("https://new.example/api")
            return {"collectionToken": "old-server-token"} if path == "/collect/profile" else {"deviceId": "test"}
        method = self.collector_method("_submit_background", {"api_request": request})
        method(app, "https://old.example/api", {}, "access", {})
        self.assertEqual([call[0] for call in calls], ["https://old.example/api", "https://old.example/api"])


if __name__ == "__main__":
    unittest.main()
