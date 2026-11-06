"""Startup diagnostics for packaged collector applications."""

from __future__ import annotations

import datetime
import faulthandler
import platform
import re
import sys
import traceback
from pathlib import Path
from types import TracebackType
from typing import TextIO


_FAULT_LOG: TextIO | None = None


def is_stale_widget_error(exception: BaseException) -> bool:
    """Return whether Tk is reporting work queued for a destroyed widget."""
    message = str(exception or "").lower()
    return "bad window path name" in message or "invalid command name" in message


def default_log_path(system: str | None = None, home: Path | None = None) -> Path:
    system = system or platform.system()
    home = home or Path.home()
    if system == "Darwin":
        return home / "Library" / "Logs" / "Spacefoot IT Collector" / "collector.log"
    if system == "Windows":
        return home / "AppData" / "Local" / "Spacefoot IT Collector" / "collector.log"
    return home / ".local" / "state" / "spacefoot-it-collector" / "collector.log"


def write_diagnostic(message: str) -> None:
    message = re.sub(r"(?i)(bearer\s+|(?:token|password|prefillCode)[=:]\s*)[^\s&,]+", r"\1[redacted]", message)
    timestamp = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    line = f"[{timestamp}] {message}\n"
    try:
        path = default_log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.stat().st_size > 1024 * 1024:
            path.replace(path.with_suffix(".log.1"))
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError:
        pass


def write_exception(
    exception_type: type[BaseException],
    exception: BaseException,
    traceback_value: TracebackType | None,
) -> None:
    detail = "".join(
        traceback.format_exception(exception_type, exception, traceback_value)
    ).rstrip()
    write_diagnostic(f"Unhandled exception:\n{detail}")


def install_startup_diagnostics() -> None:
    global _FAULT_LOG

    write_diagnostic(
        f"Starting collector on {platform.system()} {platform.release()} "
        f"with Python {platform.python_version()}."
    )
    sys.excepthook = write_exception
    try:
        path = default_log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Keep native fatal diagnostics separate from the rotating application log.
        fault_path = path.with_name("fault.log")
        if fault_path.exists() and fault_path.stat().st_size > 1024 * 1024:
            fault_path.replace(fault_path.with_suffix(".log.1"))
        _FAULT_LOG = fault_path.open("a", encoding="utf-8")
        faulthandler.enable(_FAULT_LOG, all_threads=True)
    except (OSError, RuntimeError):
        _FAULT_LOG = None
