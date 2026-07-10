"""Desktop integration helpers for the native collector."""

from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path


def linux_desktop_exec_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve()
    return Path(__file__).resolve()


def desktop_exec_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def register_linux_url_scheme() -> None:
    if platform.system() != "Linux":
        return
    executable = linux_desktop_exec_path()
    if not executable.exists():
        return
    applications_dir = Path.home() / ".local" / "share" / "applications"
    desktop_file = applications_dir / "spacefoot-it-collector.desktop"
    exec_line = f"{desktop_exec_quote(str(executable))} %u"
    if not getattr(sys, "frozen", False):
        exec_line = f"{desktop_exec_quote(sys.executable)} {desktop_exec_quote(str(executable))} %u"
    content = "\n".join(
        [
            "[Desktop Entry]",
            "Type=Application",
            "Name=Spacefoot IT Collector",
            "Comment=Spacefoot hardware inventory collector",
            f"Exec={exec_line}",
            "Terminal=false",
            "Categories=Utility;",
            "MimeType=x-scheme-handler/spacefoot-collector;",
            "",
        ]
    )
    try:
        applications_dir.mkdir(parents=True, exist_ok=True)
        if not desktop_file.exists() or desktop_file.read_text(encoding="utf-8") != content:
            desktop_file.write_text(content, encoding="utf-8")
        subprocess.run(
            ["xdg-mime", "default", desktop_file.name, "x-scheme-handler/spacefoot-collector"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
    except Exception:
        pass
