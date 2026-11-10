"""Provision build trust or sign verified final release metadata; never generates keys."""

import base64
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


def main():
    public = os.environ["COLLECTOR_UPDATE_PUBLIC_KEY"]
    Ed25519PublicKey.from_public_bytes(base64.b64decode(public, validate=True))
    if sys.argv[1] == "configure":
        path = Path("collectors/desktop_collector/config.py")
        version = os.environ["GITHUB_REF_NAME"].removeprefix("collector-v")
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise ValueError("Production tag must contain a semantic release version")
        source = path.read_text().replace('UPDATE_PUBLIC_KEY = ""', f'UPDATE_PUBLIC_KEY = "{public}"')
        source = re.sub(r'COLLECTOR_VERSION = "[^"]+"', f'COLLECTOR_VERSION = "{version}"', source)
        source = re.sub(r'COLLECTOR_BUILD_CHANNEL = "[^"]+"', 'COLLECTOR_BUILD_CHANNEL = "github-release"', source)
        path.write_text(source)
        return
    if sys.argv[1] != "sign":
        raise ValueError("Expected configure or sign")
    private = Ed25519PrivateKey.from_private_bytes(base64.b64decode(os.environ["COLLECTOR_UPDATE_PRIVATE_KEY"], validate=True))
    derived = base64.b64encode(private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
    if public != derived:
        raise ValueError("Release verification key does not match signing key")
    version = os.environ["GITHUB_REF_NAME"].removeprefix("collector-v")
    root = Path("release-upload")
    names = {"windows": f"parceo-collector-windows-{version}-setup.exe", "macos": f"parceo-collector-macos-{version}.app.zip", "linux": f"parceo-collector-linux-{version}.deb"}
    manifest = {"latestVersion": f"collector-v{version}", "expiresAt": int(time.time()) + 30 * 86400, "assets": {}}
    for platform, name in names.items():
        path = root / name
        asset = {"fileName": name, "downloadUrl": f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/releases/download/collector-v{version}/{name}", "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        if platform == "windows":
            asset["publisherThumbprint"] = os.environ["WINDOWS_PUBLISHER_THUMBPRINT"]
        manifest["assets"][platform] = asset
    payload = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    envelope = {"manifest": manifest, "signature": base64.b64encode(private.sign(payload)).decode()}
    (root / "collector-releases.signed.json").write_text(json.dumps(envelope, indent=2))


if __name__ == "__main__":
    main()
