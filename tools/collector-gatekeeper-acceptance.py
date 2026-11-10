"""Test browser provenance and LaunchServices with Gatekeeper enabled.

Never executes the payload directly, removes quarantine, grants an exception,
or approves an unidentified-developer warning. No inventory credentials needed.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import time


ASSET = "parceo-collector-macos-0.1.58.app.zip"
APP = ASSET.removesuffix(".zip")
URL = "https://github.com/badr-spacefoot/pc_inventory_2.0/releases/download/collector-manual-v0.1.58/" + ASSET
DIGEST = "69a54fe02b0cd340ea01ce5a4bad86c91eef923bb6a82bdd79e474b48204a0be"


def command(*args, timeout=40):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def quarantine(path):
    result = command("/usr/bin/xattr", "-p", "com.apple.quarantine", str(path))
    fields = result.stdout.strip().split(";")
    return {"present": result.returncode == 0 and len(fields) >= 3,
            "flags": fields[0] if fields else "", "agent": fields[2] if len(fields) >= 3 else ""}


def collector_running():
    result = command("/bin/ps", "-axo", "comm=")
    return any(line.strip().endswith("/Contents/MacOS/parceo-collector-macos") for line in result.stdout.splitlines())


def main():
    if platform.system() != "Darwin" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("Gatekeeper acceptance requires a disposable macOS CI VM")
    root = Path(os.environ["PARCEO_ACCEPTANCE_ROOT"])
    root.mkdir(parents=True, exist_ok=False)
    receipt = {"release": "0.1.58", "architecture": platform.machine(), "passed": False,
               "productionInventoryTouched": False, "directPayloadExecution": False,
               "quarantineRemoved": False, "gatekeeperExceptionGranted": False,
               "launchSucceeded": False}
    launcher = None
    try:
        spec = importlib.util.spec_from_file_location("binary_test_ui", Path(__file__).with_name("collector-binary-acceptance.py"))
        ui = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ui)
        driver = ui.ScreenDriver(root, receipt)

        def screen():
            path = root / "screen.png"
            captured = command("/usr/sbin/screencapture", "-x", str(path))
            assert captured.returncode == 0, "Screen capture unavailable"
            return json.loads(command(str(driver.helper), "ocr", str(path)).stdout)

        def wait_files(predicate, timeout=150):
            until = time.monotonic() + timeout
            while time.monotonic() < until:
                if predicate():
                    return
                lines = screen()
                text = " ".join(line["text"] for line in lines).casefold()
                # Only the expected browser download permission is accepted.
                # No Gatekeeper or system-security approval is ever clicked.
                origin = re.search(r"(?<![a-z0-9.-])(github\.com|release-\s*assets\.githubusercontent\.com)(?![a-z0-9.-])", text)
                if ("allow downloads on" in text or "allow downloads from" in text) and origin:
                    allow = [line for line in lines if line["text"].strip().casefold() == "allow"]
                    if len(allow) == 1:
                        driver.click(allow[0])
                        receipt["safariDownloadPermissionAccepted"] = True
                        receipt["safariDownloadPermissionOrigin"] = re.sub(r"\s+", "", origin[0])
                time.sleep(1)
            receipt["lastScreenText"] = [line["text"] for line in screen()]
            raise TimeoutError("Browser download/extraction did not finish")

        before = command("/usr/sbin/spctl", "--status")
        receipt["gatekeeperStatusBefore"] = before.stdout.strip()
        if "assessments disabled" in before.stdout:
            enabled = command("sudo", "/usr/sbin/spctl", "--global-enable")
            assert enabled.returncode == 0, "Cannot enable Gatekeeper in this VM"
            receipt["gatekeeperEnabledForTest"] = True
        status = command("/usr/sbin/spctl", "--status")
        assert status.returncode == 0 and "assessments enabled" in status.stdout, "Gatekeeper must be enabled"
        receipt["gatekeeperEnabled"] = True
        assert not collector_running(), "Fresh VM must not have an already-running collector"

        downloads = Path.home() / "Downloads"
        archive_paths = [downloads / ASSET, Path.home() / ".Trash" / ASSET]
        app = downloads / APP
        assert not app.exists() and not any(path.exists() for path in archive_paths), "Fresh browser download required"
        opened = command("/usr/bin/open", "-a", "Safari", URL)
        assert opened.returncode == 0, "Safari could not open the release download"
        wait_files(lambda: any(path.is_file() and path.stat().st_size == 40640718 for path in archive_paths))
        archive = next(path for path in archive_paths if path.is_file())
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == DIGEST, "Downloaded package checksum mismatch"
        receipt["safariDownloadedPublishedArchive"] = True
        receipt["publishedArchiveSha256"] = DIGEST
        receipt["archiveQuarantine"] = quarantine(archive)
        assert receipt["archiveQuarantine"]["present"], "Browser download lacks quarantine"
        if not app.exists():
            extracted = command("/usr/bin/open", str(archive))
            assert extracted.returncode == 0, "Archive Utility could not open the downloaded ZIP"
        wait_files(app.is_dir, timeout=90)
        receipt["appQuarantineBeforeLaunch"] = quarantine(app)
        assert receipt["appQuarantineBeforeLaunch"]["present"], "Extracted application must retain quarantine"
        integrity = command("/usr/bin/codesign", "--verify", "--deep", "--strict", str(app))
        receipt["bundleIntegrityVerified"] = integrity.returncode == 0
        assert receipt["bundleIntegrityVerified"], "Published bundle integrity failed"
        identity = command("/usr/bin/codesign", "-d", "--verbose=4", str(app))
        receipt["adHocSignature"] = "Signature=adhoc" in identity.stderr
        assert not collector_running(), "Payload must not execute before LaunchServices test"

        launcher = subprocess.Popen(["/usr/bin/open", str(app)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        until = time.monotonic() + 35
        blocked = False
        while time.monotonic() < until:
            lines = screen()
            text = " ".join(line["text"] for line in lines).casefold()
            if any(phrase in text for phrase in ("could not verify", "cannot be opened", "can't be opened", "is damaged", "unidentified developer", "developer cannot be verified", "apple cannot check")):
                blocked = True
                receipt["gatekeeperDialogText"] = [line["text"] for line in lines]
                break
            if collector_running():
                receipt["launchSucceeded"] = True
                break
            time.sleep(1)
        receipt["gatekeeperBlockVisible"] = blocked
        receipt["launchServicesExitCode"] = launcher.poll()
        receipt["collectorProcessObserved"] = collector_running()
        (root / "launch-result.png").write_bytes((root / "screen.png").read_bytes())
        assessment = command("/usr/sbin/spctl", "--assess", "--type", "execute", "--verbose=4", str(app))
        receipt["gatekeeperAssessmentExitCode"] = assessment.returncode
        receipt["gatekeeperAssessment"] = (assessment.stdout + assessment.stderr).strip()
        stapler = command("/usr/bin/xcrun", "stapler", "validate", str(app))
        receipt["staplerExitCode"] = stapler.returncode
        receipt["appQuarantineAfterLaunch"] = quarantine(app)
        after = command("/usr/sbin/spctl", "--status")
        assert "assessments enabled" in after.stdout, "Gatekeeper state changed"
        assert receipt["appQuarantineAfterLaunch"]["present"], "Quarantine must remain present"
        assert not receipt["collectorProcessObserved"], "Unsigned quarantined payload unexpectedly executed"
        assert blocked and assessment.returncode != 0, "Expected a visible Gatekeeper rejection for this manual release"
        receipt["outcome"] = "blocked-by-gatekeeper"
        # Passing means the download/provenance/policy test is conclusive;
        # launchSucceeded remains false. It does not certify app distribution.
        receipt["passed"] = True
    except Exception as error:
        receipt["failure"] = f"{type(error).__name__}: {error}"
        if (root / "screen.png").exists():
            (root / "launch-result.png").write_bytes((root / "screen.png").read_bytes())
        raise
    finally:
        if launcher and launcher.poll() is None:
            # Stop only the waiting open client, without approving the alert.
            launcher.terminate()
            launcher.wait(timeout=10)
        (root / "result.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
