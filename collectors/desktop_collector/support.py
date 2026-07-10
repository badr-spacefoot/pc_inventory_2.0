"""Infrastructure and pure helpers for the desktop collector."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:
    from .config import COLLECTOR_VERSION, DEFAULT_API_URL, DRAFT_PATH
except ImportError:  # Supports direct execution and PyInstaller entry points.
    from config import COLLECTOR_VERSION, DEFAULT_API_URL, DRAFT_PATH


_HTTP_SSL_CONTEXT: ssl.SSLContext | None = None


def http_ssl_context() -> ssl.SSLContext:
    global _HTTP_SSL_CONTEXT
    if _HTTP_SSL_CONTEXT is not None:
        return _HTTP_SSL_CONTEXT

    cafile = os.environ.get("SSL_CERT_FILE")
    if not cafile:
        try:
            import certifi

            cafile = certifi.where()
        except Exception:
            cafile = ""

    if cafile and Path(cafile).exists():
        _HTTP_SSL_CONTEXT = ssl.create_default_context(cafile=cafile)
    else:
        _HTTP_SSL_CONTEXT = ssl.create_default_context()
    return _HTTP_SSL_CONTEXT


def load_draft() -> dict[str, Any]:
    try:
        value = json.loads(DRAFT_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_draft(values: dict[str, Any]) -> None:
    try:
        DRAFT_PATH.write_text(json.dumps(values, indent=2), encoding="utf-8")
    except OSError:
        pass


def clear_sensitive_draft() -> None:
    draft = load_draft()
    api_url = normalize_api_url(draft.get("apiUrl") or DEFAULT_API_URL)
    save_draft({"apiUrl": api_url})


def normalize_api_url(value: object) -> str:
    text = str(value or "").strip().strip('"')
    if not text:
        return DEFAULT_API_URL
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text):
        text = f"https://{text}"
    parsed = urllib.parse.urlparse(text)
    host = parsed.netloc.lower()
    scheme = parsed.scheme or "https"
    path = parsed.path.rstrip("/")
    if host.endswith(".supabase.co") or host == "supabase.co":
        scheme = "https"
        path = "/functions/v1/inventory-api"
    return urllib.parse.urlunparse((scheme, parsed.netloc, path or "", "", "", ""))


def version_tuple(value: object) -> tuple[int, ...]:
    text = str(value or "").strip().lower().replace("collector-v", "").lstrip("v")
    parts = re.findall(r"\d+", text)
    return tuple(int(part) for part in parts[:4]) or (0,)


def is_newer_version(candidate: object, current: object) -> bool:
    left = version_tuple(candidate)
    right = version_tuple(current)
    size = max(len(left), len(right))
    return left + (0,) * (size - len(left)) > right + (0,) * (size - len(right))


def version_label(value: object) -> str:
    return ".".join(str(part) for part in version_tuple(value))


def fetch_json_url(url: str, timeout: float = 10) -> dict[str, Any]:
    separator = "&" if "?" in url else "?"
    uncached_url = f"{url}{separator}v={int(time.time())}"
    request = urllib.request.Request(
        uncached_url,
        headers={
            "User-Agent": f"spacefoot-it-collector/{COLLECTOR_VERSION}",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(
        request,
        timeout=timeout,
        context=http_ssl_context(),
    ) as response:
        value = json.loads(response.read().decode("utf-8"))
        return value if isinstance(value, dict) else {}


def download_file(url: str, destination: Path, timeout: float = 60) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": f"spacefoot-it-collector/{COLLECTOR_VERSION}"},
    )
    with urllib.request.urlopen(
        request,
        timeout=timeout,
        context=http_ssl_context(),
    ) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)


def api_request(
    api_url: str,
    path: str,
    method: str = "GET",
    body: object | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 25,
) -> dict[str, Any]:
    url = f"{normalize_api_url(api_url).rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    with urllib.request.urlopen(
        request,
        timeout=timeout,
        context=http_ssl_context(),
    ) as response:
        raw = response.read().decode("utf-8")
        if not raw:
            return {}
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}


def api_error_message(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        detail = exc.read().decode("utf-8", errors="ignore")
        try:
            value = json.loads(detail)
            return value.get("error", detail) if isinstance(value, dict) else detail
        except json.JSONDecodeError:
            return detail or str(exc)
    if isinstance(exc, urllib.error.URLError):
        return f"API unreachable: {exc.reason}"
    return str(exc)


def money_text(value: object) -> str:
    return "-" if value in (None, "") else str(value)


def as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def compact_number(value: object, digits: int = 0) -> str:
    number = as_float(value)
    if number is None:
        return ""
    if digits == 0:
        return str(int(round(number)))
    return f"{number:.{digits}f}".rstrip("0").rstrip(".")


def downloads_dirs(home: Path | None = None) -> list[Path]:
    home = home or Path.home()
    candidates = [
        home / "Downloads",
        home / "Téléchargements",
        home / "Telechargements",
    ]
    user_dirs = home / ".config" / "user-dirs.dirs"
    try:
        content = user_dirs.read_text(encoding="utf-8")
    except OSError:
        content = ""
    match = re.search(
        r'^XDG_DOWNLOAD_DIR=(?P<quote>["\'])(?P<path>.*?)(?P=quote)',
        content,
        flags=re.MULTILINE,
    )
    if match:
        xdg_path = match.group("path").replace("$HOME", str(home))
        candidates.insert(0, Path(os.path.expandvars(os.path.expanduser(xdg_path))))

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def newest_prefill_file(home: Path | None = None) -> Path | None:
    candidates: list[Path] = []
    for directory in downloads_dirs(home):
        try:
            candidates.extend(directory.glob("spacefoot-collector-prefill*.json"))
        except OSError:
            continue
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def os_icon_name(os_name: object) -> str:
    text = str(os_name or "").lower()
    if "windows" in text:
        return "WIN"
    if "mac" in text or "darwin" in text:
        return "MAC"
    if "linux" in text:
        return "LNX"
    return "OS"


def launch_prefill_from_args(argv: list[str]) -> dict[str, str]:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("launch_url", nargs="?")
    parser.add_argument("--prefill-code", dest="prefill_code")
    parser.add_argument("--api-url", dest="api_url")
    try:
        args, remaining = parser.parse_known_args(argv[1:])
    except SystemExit:
        return {}

    result = {
        "prefillCode": str(args.prefill_code or "").strip(),
        "apiUrl": normalize_api_url(args.api_url) if args.api_url else "",
        "launchUrl": "",
    }
    launch_url = str(args.launch_url or "").strip()
    for value in [*remaining, *argv[1:]]:
        text = str(value or "").strip()
        if text.lower().startswith("/launchurl="):
            launch_url = text.split("=", 1)[1].strip().strip('"')
            break

    if launch_url.startswith("spacefoot-collector://"):
        result["launchUrl"] = launch_url
        parsed = urllib.parse.urlparse(launch_url)
        params = urllib.parse.parse_qs(parsed.query)
        result["prefillCode"] = result["prefillCode"] or (
            params.get("prefillCode")
            or params.get("prefill")
            or params.get("code")
            or params.get("token")
            or [""]
        )[0].strip()
        result["apiUrl"] = result["apiUrl"] or normalize_api_url(
            (params.get("apiUrl") or [""])[0]
        )
    return {key: value for key, value in result.items() if value}
