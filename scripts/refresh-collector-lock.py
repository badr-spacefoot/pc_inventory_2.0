"""Explicit maintainer operation: refresh build pins/hashes, then review and test."""
import json
from pathlib import Path
import urllib.request

names = ["pyinstaller", "certifi", "cryptography", "altgraph", "packaging", "pyinstaller-hooks-contrib", "setuptools", "pefile", "pywin32-ctypes", "cffi", "pycparser"]
rows = ["# Pinned PyPI artifacts; refresh deliberately and test on supported OS."]
for name in names:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/json", timeout=20) as response:
        data = json.load(response)
    marker = ' ; sys_platform == "win32"' if name in {"pefile", "pywin32-ctypes"} else ""
    hashes = " ".join("--hash=sha256:" + asset["digests"]["sha256"] for asset in data["urls"])
    rows.append(f"{name}=={data['info']['version']}{marker} {hashes}")
Path("collectors/requirements-build.lock").write_text("\n".join(rows) + "\n")
