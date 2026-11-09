"""Build an allowlisted, inspectable source collector bundle; never installs or scans."""

import argparse
import ast
import hashlib
import json
import re
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
MODULES = (
    "__init__", "collector_app", "config", "diagnostics", "platform_integration",
    "prefill", "prefill_update", "scan_presentation", "support", "ui", "update_security", "branding",
)
FILES = (
    "collectors/__init__.py",
    *(f"collectors/desktop_collector/{name}.py" for name in MODULES),
    "scripts/collect-cross-platform.py",
    "collectors/osquery/spacefoot_inventory.sql",
    "frontend/assets/brand/app-icon.png",
    "frontend/assets/brand/app-icon.ico",
    "frontend/assets/brand/parceo/logo-light.png",
    "frontend/assets/brand/parceo/logo-dark.png",
    "frontend/assets/brand/parceo/fonts/Manrope-Regular.ttf",
    "frontend/assets/brand/parceo/fonts/Manrope-Bold.ttf",
    "frontend/assets/brand/parceo/fonts/Manrope-OFL.txt",
    "frontend/assets/brand/parceo/fonts/IBMPlexMono-Regular.ttf",
    "frontend/assets/brand/parceo/fonts/IBMPlexMono-OFL.txt",
    "docs/collector/source-distribution.md",
)


def package(output: Path) -> dict:
    payloads = {}
    for relative in FILES:
        path = ROOT / relative
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Missing or unsafe collector source: {relative}")
        data = path.read_bytes()
        if relative.endswith(".py"):
            compile(data, relative, "exec")
        if relative == "collectors/desktop_collector/config.py":
            text = data.decode("utf-8")
            text = re.sub(r'^UPDATE_PUBLIC_KEY = "[^"]*"', 'UPDATE_PUBLIC_KEY = ""', text, flags=re.M)
            text = re.sub(r'^COLLECTOR_BUILD_CHANNEL = "[^"]*"', 'COLLECTOR_BUILD_CHANNEL = "source"', text, flags=re.M)
            data = text.encode("utf-8")
        payloads[relative] = data
    config = ast.parse(payloads["collectors/desktop_collector/config.py"])
    version = next(ast.literal_eval(node.value) for node in config.body
                   if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "COLLECTOR_VERSION" for t in node.targets))
    manifest = {
        "schemaVersion": 1, "kind": "collector-source-bundle", "version": version,
        "channel": "source", "signedInstaller": False,
        "files": [{"path": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for name, data in sorted(payloads.items())],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payloads.items()):
            archive.writestr(name, data)
        archive.writestr("SOURCE-MANIFEST.json", json.dumps(manifest, ensure_ascii=True, indent=2) + "\n")
        archive.writestr("README.txt", "Read docs/collector/source-distribution.md before use.\n"
                         "Requires an approved Python 3.12+ installation with Tkinter.\n"
                         "Launch: python collectors/desktop_collector/collector_app.py\n"
                         "No antivirus or execution-policy changes are required or performed.\n")
    return {"version": version, "path": str(output), "size": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "fileCount": len(payloads)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    print(json.dumps(package(parser.parse_args().output), indent=2))
