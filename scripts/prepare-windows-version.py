"""Generate the Windows resource metadata before packaging Parcéo Collector."""

import argparse
import ast
from pathlib import Path
import re


def version_resource(version: str) -> str:
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-dev)?", version)
    if not match or any(int(part) > 65535 for part in match.groups()):
        raise ValueError("Expected a supported semantic collector version")
    numbers = tuple(int(part) for part in match.groups()) + (0,)
    fields = {
        "CompanyName": "Piqa",
        "FileDescription": "Parcéo Collector",
        "FileVersion": ".".join(map(str, numbers)),
        "InternalName": "parceo-collector-windows",
        "OriginalFilename": "parceo-collector-windows.exe",
        "ProductName": "Parcéo Collector",
        "ProductVersion": version,
    }
    strings = ",\n".join(f"StringStruct({key!r}, {value!r})" for key, value in fields.items())
    return (
        f"VSVersionInfo(ffi=FixedFileInfo(filevers={numbers!r}, prodvers={numbers!r}, "
        "mask=0x3f, flags=0, OS=0x40004, fileType=1, subtype=0, date=(0, 0)), "
        f"kids=[StringFileInfo([StringTable('040904B0', [{strings}])]), "
        "VarFileInfo([VarStruct('Translation', [1033, 1200])])])\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version")
    args = parser.parse_args()
    version = args.version
    if version is None:
        tree = ast.parse(Path("collectors/desktop_collector/config.py").read_text(encoding="utf-8"))
        version = next(ast.literal_eval(node.value) for node in tree.body
                       if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "COLLECTOR_VERSION" for t in node.targets))
    output = Path("build/windows-version.txt")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(version_resource(version), encoding="utf-8")
