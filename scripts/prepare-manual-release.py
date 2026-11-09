"""Prepare immutable manual downloads; never create signed update metadata."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import zipfile

tag = os.environ["GITHUB_REF_NAME"]
match = re.fullmatch(r"collector-manual-v(\d+\.\d+\.\d+)", tag)
if not match:
    raise SystemExit("Expected an explicitly manual release tag")
version = match[1]
repo = os.environ["GITHUB_REPOSITORY"]
base = f"https://github.com/{repo}/releases"
output = Path("release-upload")
output.mkdir(exist_ok=False)
inputs = {
    "windows": (f"Spacefoot-IT-Collector-{version}-Setup.exe", f"spacefoot-it-collector-windows-{version}-setup.exe"),
    "macos": (f"spacefoot-it-collector-macos-{version}.app.zip", f"spacefoot-it-collector-macos-{version}.app.zip"),
    "linux": (f"spacefoot-it-collector-linux-{version}.deb", f"spacefoot-it-collector-linux-{version}.deb"),
    "source": ("collector-source.zip", f"parceo-collector-source-{version}.zip"),
}
manifest = {"latestVersion": f"collector-v{version}", "releasePageUrl": f"{base}/tag/{tag}",
            "fallbackReleasePageUrl": base, "manualOnly": True, "signed": False, "assets": {}}
for platform, (pattern, name) in inputs.items():
    matches = list(Path("release-assets").rglob(pattern))
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one {platform} artifact")
    artifact = output / name
    shutil.copyfile(matches[0], artifact)
    if platform == "source":
        with zipfile.ZipFile(artifact) as archive:
            source = json.loads(archive.read("SOURCE-MANIFEST.json"))
            if source["version"] != version:
                raise SystemExit("Source version mismatch")
    else:
        manifest["assets"][platform] = {"platform": platform, "version": f"collector-v{version}",
            "fileName": name, "downloadUrl": f"{base}/download/{tag}/{name}",
            "releasePageUrl": f"{base}/tag/{tag}", "signed": False,
            "size": artifact.stat().st_size, "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest()}
(output / "collector-releases.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(output / "SHA256SUMS.txt").write_text("".join(
    f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in sorted(output.iterdir()) if p.is_file()), encoding="utf-8")
