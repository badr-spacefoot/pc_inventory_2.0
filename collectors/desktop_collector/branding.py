"""Parcéo assets and process-private typography; never installs system fonts."""
from __future__ import annotations

import ctypes
import ctypes.util
import os
from pathlib import Path
import platform
import sys

_registered: set[str] = set()
FONT_FILES = ("Manrope-Regular.ttf", "Manrope-Bold.ttf", "IBMPlexMono-Regular.ttf")
WINDOWS_APP_ID = "Piqa.Parceo.Collector"


def configure_windows_identity() -> bool:
    """Give the taskbar this app's identity before Tk creates any window."""
    if platform.system() != "Windows":
        return False
    try:
        configure = ctypes.WinDLL("shell32", use_last_error=True).SetCurrentProcessExplicitAppUserModelID
        configure.argtypes = [ctypes.c_wchar_p]
        configure.restype = ctypes.c_long
        return configure(WINDOWS_APP_ID) == 0
    except (OSError, AttributeError):
        return False


def asset_path(relative: str) -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")) / "assets/brand" / relative
    return Path(__file__).resolve().parents[2] / "frontend/assets/brand" / relative


def register_private_fonts() -> dict[str, bool]:
    """Register bundled fonts for this process, falling back safely on any failure.

    Windows: AddFontResourceExW FR_PRIVATE. macOS: CoreText scope Process.
    Linux: Fontconfig application font set, no configuration/cache file writes.
    """
    result = {}
    for name in FONT_FILES:
        path = asset_path("parceo/fonts/" + name)
        if str(path) in _registered:
            result[name] = True
            continue
        loaded = False
        try:
            if not path.is_file():
                result[name] = False
                continue
            if platform.system() == "Windows":
                add = ctypes.WinDLL("gdi32", use_last_error=True).AddFontResourceExW
                add.argtypes = [ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_void_p]
                add.restype = ctypes.c_int
                loaded = add(str(path), 0x10, None) > 0
            elif platform.system() == "Darwin":
                cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
                ct = ctypes.CDLL("/System/Library/Frameworks/CoreText.framework/CoreText")
                cf.CFURLCreateFromFileSystemRepresentation.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_bool]
                cf.CFURLCreateFromFileSystemRepresentation.restype = ctypes.c_void_p
                cf.CFRelease.argtypes = [ctypes.c_void_p]
                cf.CFRelease.restype = None
                ct.CTFontManagerRegisterFontsForURL.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p)]
                ct.CTFontManagerRegisterFontsForURL.restype = ctypes.c_bool
                filename = os.fsencode(path)
                url = cf.CFURLCreateFromFileSystemRepresentation(None, filename, len(filename), False)
                if url:
                    error = ctypes.c_void_p()
                    try:
                        loaded = bool(ct.CTFontManagerRegisterFontsForURL(url, 1, ctypes.byref(error)))
                    finally:
                        if error.value:
                            cf.CFRelease(error)
                        cf.CFRelease(url)
            elif platform.system() == "Linux":
                library = ctypes.util.find_library("fontconfig")
                if library:
                    fc = ctypes.CDLL(library)
                    fc.FcConfigAppFontAddFile.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
                    fc.FcConfigAppFontAddFile.restype = ctypes.c_int
                    loaded = bool(fc.FcConfigAppFontAddFile(None, os.fsencode(path)))
            if loaded:
                _registered.add(str(path))
        except (OSError, AttributeError, ValueError):
            loaded = False
        result[name] = loaded
    return result
