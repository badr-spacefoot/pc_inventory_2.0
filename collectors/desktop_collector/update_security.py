"""Fail-closed release authentication, download validation and archive limits."""

import base64
import hashlib
import json
import math
import os
import re
import subprocess
import time
import urllib.parse
from pathlib import Path


def https_url(url: str) -> str:
    if not isinstance(url, str) or len(url) > 8192 or any(ord(char) < 33 for char in url):
        raise ValueError("Invalid update URL")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError("Updates require an HTTPS URL without credentials")
    return url


def verify_manifest(envelope: dict, public_key: str) -> dict:
    if not public_key:
        raise ValueError("Automatic updates await a configured release verification key")
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    if not isinstance(envelope, dict) or not isinstance(envelope.get("manifest"), dict):
        raise ValueError("Invalid release metadata")
    manifest = envelope["manifest"]
    signed = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key, validate=True))
    key.verify(base64.b64decode(envelope["signature"], validate=True), signed)
    expires = manifest.get("expiresAt")
    if type(expires) not in (int, float) or not math.isfinite(expires) or not time.time() < expires:
        raise ValueError("Release metadata expired")
    return manifest


def release_version(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"(?:collector-v)?\d+\.\d+\.\d+", value):
        raise ValueError("Invalid collector release version")
    return value.removeprefix("collector-v")


def release_asset(manifest: dict, platform_key: str) -> dict:
    """Validate signed metadata before creating a path or downloading anything."""
    release_version(manifest.get("latestVersion"))
    assets = manifest.get("assets")
    asset = assets.get(platform_key) if isinstance(assets, dict) else None
    suffix = {"windows": ".exe", "linux": ".deb", "macos": ".app.zip"}.get(platform_key)
    if not suffix or not isinstance(asset, dict):
        raise ValueError("Release has no asset for this platform")
    name = asset.get("fileName")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,199}", name) or not name.endswith(suffix):
        raise ValueError("Invalid release asset filename")
    size = asset.get("size")
    if type(size) is not int or not 0 < size <= 512 * 1024**2:
        raise ValueError("Invalid release asset size")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", str(asset.get("sha256", ""))):
        raise ValueError("Invalid release asset checksum")
    https_url(asset.get("downloadUrl"))
    return asset


def verify_download(path: Path, asset: dict) -> None:
    expected = str(asset.get("sha256", "")).lower()
    size = asset.get("size")
    if not re.fullmatch(r"[a-f0-9]{64}", expected) or type(size) is not int or size <= 0:
        raise ValueError("Release metadata lacks checksum or size")
    if path.stat().st_size != size:
        raise ValueError("Update size mismatch")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != expected:
        raise ValueError("Update checksum mismatch")


def verify_windows_publisher(path: Path, thumbprint: str) -> None:
    if not re.fullmatch(r"[A-Fa-f0-9]{40,64}", thumbprint or ""):
        raise ValueError("Release metadata lacks a trusted Windows publisher")
    # Arguments are supplied separately; no downloaded text is shell code.
    script = "$s=Get-AuthenticodeSignature -LiteralPath $env:SPACEFOOT_VERIFY_FILE; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Thumbprint -ne $env:SPACEFOOT_VERIFY_PUBLISHER) { exit 1 }"
    env = {**os.environ, "SPACEFOOT_VERIFY_FILE": str(path), "SPACEFOOT_VERIFY_PUBLISHER": thumbprint}
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env=env, check=True, timeout=30)


def extract_app_archive(archive, destination: Path) -> None:
    members = archive.infolist()
    if len(members) > 30000 or sum(item.file_size for item in members) > 2 * 1024**3:
        raise ValueError("Update archive exceeds extraction limits")
    root = destination.resolve()
    links = []
    for item in members:
        target = (root / item.filename).resolve()
        if not target.is_relative_to(root):
            raise ValueError("Unsafe update archive path")
        if (item.external_attr >> 16) & 0o170000 == 0o120000:
            link = archive.read(item).decode("utf-8")
            if Path(link).is_absolute() or not (target.parent / link).resolve().is_relative_to(root):
                raise ValueError("Unsafe update archive symlink")
            links.append((target, link))
        else:
            archive.extract(item, destination)
            mode = (item.external_attr >> 16) & 0o777
            if mode and target.exists():
                target.chmod(mode)
    # Links come last so archive members cannot be written through them.
    for target, link in links:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(link)
    for target, _ in links:
        if not target.resolve().is_relative_to(root):
            raise ValueError("Unsafe update archive symlink chain")
