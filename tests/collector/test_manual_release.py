"""Manual publication must not enter the trusted automatic-update channel."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]


class ManualReleaseTests(unittest.TestCase):
    def execute(self, script, directory, tag):
        return subprocess.run(
            [sys.executable, str(ROOT / "scripts" / script)], cwd=directory,
            env={**os.environ, "GITHUB_REF_NAME": tag, "GITHUB_REPOSITORY": "owner/repo"},
            capture_output=True, text=True, timeout=15,
        )

    def test_manual_configuration_refuses_stable_tag_and_existing_trust_key(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "collectors/desktop_collector/config.py"
            config.parent.mkdir(parents=True)
            original = 'COLLECTOR_VERSION = "0.1.54-dev"\nCOLLECTOR_BUILD_CHANNEL = "source"\nUPDATE_PUBLIC_KEY = "existing-trust"\n'
            config.write_text(original)
            for tag in ["collector-v0.1.54", "collector-manual-v0.1.54"]:
                result = self.execute("configure-manual-collector.py", directory, tag)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(config.read_text(), original)

    def test_manual_build_has_no_automatic_update_key(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "collectors/desktop_collector/config.py"
            config.parent.mkdir(parents=True)
            config.write_text('COLLECTOR_VERSION = "0.1.54-dev"\nCOLLECTOR_BUILD_CHANNEL = "source"\nUPDATE_PUBLIC_KEY = ""\n')
            result = self.execute("configure-manual-collector.py", directory, "collector-manual-v0.1.54")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('COLLECTOR_VERSION = "0.1.54"', config.read_text())
            self.assertIn('COLLECTOR_BUILD_CHANNEL = "manual-unsigned"', config.read_text())
            self.assertIn('UPDATE_PUBLIC_KEY = ""', config.read_text())

    def test_manual_publication_checks_completeness_and_does_not_sign_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory) / "release-assets"
            assets.mkdir()
            for name in ["Spacefoot-IT-Collector-0.1.54-Setup.exe", "spacefoot-it-collector-macos-0.1.54.app.zip", "spacefoot-it-collector-linux-0.1.54.deb"]:
                (assets / name).write_bytes(b"synthetic-build")
            with zipfile.ZipFile(assets / "collector-source.zip", "w") as archive:
                archive.writestr("SOURCE-MANIFEST.json", json.dumps({"version": "0.1.54"}))
            result = self.execute("prepare-manual-release.py", directory, "collector-manual-v0.1.54")
            self.assertEqual(result.returncode, 0, result.stderr)
            output = Path(directory) / "release-upload"
            manifest = json.loads((output / "collector-releases.json").read_text())
            self.assertTrue(manifest["manualOnly"])
            self.assertFalse(manifest["signed"])
            self.assertEqual(set(manifest["assets"]), {"windows", "macos", "linux"})
            self.assertFalse((output / "collector-releases.signed.json").exists())
            for line in (output / "SHA256SUMS.txt").read_text().splitlines():
                digest, name = line.split("  ")
                self.assertEqual(digest, hashlib.sha256((output / name).read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()
