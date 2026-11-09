"""Assemble PNG-backed ICO/ICNS containers and a checksum-verified local ZIP."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT = Path(__file__).resolve().parent


def png(path, size):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    assert struct.unpack(">II", data[16:24]) == (size, size), path
    return data


def ico(output, pngs):
    header = struct.pack("<HHH", 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = [], []
    for source, size in pngs:
        blob = png(source, size)
        assert size <= 256
        entries.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset))
        blobs.append(blob)
        offset += len(blob)
    output.write_bytes(header + b"".join(entries) + b"".join(blobs))


def verify_ico(path, sizes):
    data = path.read_bytes()
    assert struct.unpack("<HHH", data[:6]) == (0, 1, len(sizes))
    for i, expected in enumerate(sizes):
        width, height, _, _, planes, bpp, length, offset = struct.unpack("<BBBBHHII", data[6 + 16*i:22 + 16*i])
        assert (width or 256, height or 256, planes, bpp) == (expected, expected, 1, 32)
        blob = data[offset:offset + length]
        assert blob[:8] == b"\x89PNG\r\n\x1a\n"
        assert struct.unpack(">II", blob[16:24]) == (expected, expected)


def main():
    ico(ROOT / "web/favicon.ico", [(ROOT / f"web/favicon-{s}.png", s) for s in [16, 32, 48]])
    native_sizes = [16, 24, 32, 48, 64, 128, 256]
    ico(ROOT / "collector/parceo-collector.ico", [(ROOT / f"collector/parceo-collector-{s}.png", s) for s in native_sizes])
    verify_ico(ROOT / "web/favicon.ico", [16, 32, 48])
    verify_ico(ROOT / "collector/parceo-collector.ico", native_sizes)
    chunks = []
    entries = {"icp4": 16, "icp5": 32, "icp6": 64, "ic07": 128, "ic08": 256, "ic09": 512, "ic10": 1024}
    for tag, size in entries.items():
        blob = png(ROOT / f"collector/parceo-collector-square-{size}.png", size)
        chunks.append(tag.encode("ascii") + struct.pack(">I", len(blob) + 8) + blob)
    data = b"".join(chunks)
    (ROOT / "collector/parceo-collector.icns").write_bytes(b"icns" + struct.pack(">I", len(data) + 8) + data)
    data = (ROOT / "collector/parceo-collector.icns").read_bytes()
    assert data[:4] == b"icns" and struct.unpack(">I", data[4:8])[0] == len(data)
    pos = 8
    for tag, size in entries.items():
        assert data[pos:pos + 4].decode("ascii") == tag
        length = struct.unpack(">I", data[pos + 4:pos + 8])[0]
        assert struct.unpack(">II", data[pos + 24:pos + 32]) == (size, size)
        pos += length
    assert pos == len(data)
    checks = {"faviconIcoSizes": [16, 32, 48], "collectorIcoSizes": native_sizes, "collectorIcnsSizes": list(entries.values()), "containerHeadersAndPngDimensionsValid": True, "nativeOperatingSystemAcceptanceTested": False}
    (ROOT / "sources/icon-container-checks.json").write_text(json.dumps(checks, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "SHA256SUMS.json"
    files = sorted(p for p in ROOT.rglob("*") if p.is_file() and p != manifest_path and "__pycache__" not in p.parts)
    records = [{"file": p.relative_to(ROOT).as_posix(), "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
    manifest_path.write_text(json.dumps({"brand": "Parcéo", "version": "2.0", "date": "2026-11-09", "files": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    destination = ROOT.parents[2] / "dist/parceo-identite-v2.0-sillage.zip"
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A repeat build replaces only this named generated ZIP, never source assets.
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in [*files, manifest_path]:
            archive.write(file, "parceo-identity/" + file.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        for record in records:
            assert hashlib.sha256(archive.read("parceo-identity/" + record["file"])).hexdigest() == record["sha256"]
    print(f"Verified {len(records)} assets/documents; ZIP {destination.name}: {destination.stat().st_size} bytes")
    print("SHA256", hashlib.sha256(destination.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
