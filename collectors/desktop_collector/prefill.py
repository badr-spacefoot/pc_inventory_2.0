"""Prefill acquisition and application workflow for the desktop collector."""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.parse
from tkinter import messagebox

try:
    from .config import PREFILL_FILE_MAX_AGE_SECONDS
    from .support import (
        api_error_message,
        api_request,
        launch_prefill_from_args,
        newest_prefill_file,
        normalize_api_url,
    )
except ImportError:  # Supports direct execution and PyInstaller entry points.
    from config import PREFILL_FILE_MAX_AGE_SECONDS
    from support import (
        api_error_message,
        api_request,
        launch_prefill_from_args,
        newest_prefill_file,
        normalize_api_url,
    )


class PrefillMixin:
    """Loads prefill profiles from links, files, and the inventory API."""

    def load_prefill(self) -> None:
        if not self.prefill_code.get().strip():
            messagebox.showwarning(
                self.t("Prefill code"),
                self.t("Please enter the prefill code."),
            )
            return
        self.status.set(self.t("Load prefill"))
        threading.Thread(target=self._load_prefill_background, daemon=True).start()

    def auto_load_prefill_file(self) -> None:
        path = newest_prefill_file()
        if not path:
            return
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return
        if time.time() - mtime > PREFILL_FILE_MAX_AGE_SECONDS:
            return
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            return
        code = str(data.get("prefillCode") or "").strip()
        launch_url = str(data.get("launchUrl") or "").strip()
        if launch_url.startswith("spacefoot-collector://"):
            launch_prefill = launch_prefill_from_args([sys.argv[0], launch_url])
            code = code or str(launch_prefill.get("prefillCode") or "").strip()
            if launch_prefill.get("apiUrl") and not data.get("apiUrl"):
                data["apiUrl"] = launch_prefill.get("apiUrl")
        if not code:
            return
        current_code = self.prefill_code.get().strip()
        if current_code and code != current_code:
            return
        already_loaded = (
            str(path) == self.last_loaded_prefill_file
            and mtime <= self.last_loaded_prefill_mtime
        )
        if already_loaded:
            return
        if data.get("apiUrl"):
            self.api_url.set(normalize_api_url(str(data.get("apiUrl"))))
        self.prefill_code.set(code)
        self.last_loaded_prefill_file = str(path)
        self.last_loaded_prefill_mtime = mtime
        self.status.set(
            self.t("Prefill file loaded automatically. You can edit before submitting.")
        )
        self.persist_draft()
        if data.get("accessToken") or any(
            data.get(key)
            for key in ("firstName", "lastName", "email", "team", "establishment")
        ):
            self.apply_prefill(data)
            return
        self.load_prefill()

    def start_prefill_file_watch(self) -> None:
        if self.prefill_watch_active:
            return
        self.prefill_watch_active = True
        self.prefill_file_watch_tick()

    def prefill_file_watch_tick(self) -> None:
        self.auto_load_prefill_file()
        profile_complete = not self.profile_missing_fields() and bool(
            self.access_token.get().strip()
        )
        if profile_complete:
            self.prefill_watch_active = False
            return
        self.after(2500, self.prefill_file_watch_tick)

    def mark_newest_prefill_file_seen(self) -> None:
        path = newest_prefill_file()
        if not path:
            return
        try:
            self.last_loaded_prefill_file = str(path)
            self.last_loaded_prefill_mtime = path.stat().st_mtime
        except OSError:
            return

    def _load_prefill_background(self) -> None:
        try:
            data = api_request(
                normalize_api_url(self.api_url.get()),
                f"/collect/prefill/{urllib.parse.quote(self.prefill_code.get().strip())}",
                timeout=15,
            )
            self.after(0, lambda: self.apply_prefill(data))
        except Exception as exc:
            self.after(0, lambda: self.status.set(api_error_message(exc)))

    def apply_prefill(self, data: dict) -> None:
        if data.get("apiUrl"):
            self.api_url.set(normalize_api_url(data.get("apiUrl")))
        if data.get("accessToken"):
            self.access_token.set(data.get("accessToken"))
        for key, variable in [
            ("firstName", self.first_name),
            ("lastName", self.last_name),
            ("email", self.email),
            ("team", self.team),
            ("establishment", self.establishment),
            ("proposedTeam", self.proposed_team),
            ("proposedEstablishment", self.proposed_establishment),
            ("comment", self.comment),
        ]:
            if data.get(key) is not None:
                variable.set(str(data.get(key) or ""))
        if data.get("language") in ("fr", "en"):
            self.language.set(data.get("language"))
        if data.get("theme") in ("dark", "light", "system"):
            self.theme_preference.set(data.get("theme"))
            self.theme_preference_explicit = False
        self.profile_visible.set(bool(self.profile_missing_fields()))
        self.step_index = 0
        if self.access_token.get().strip():
            self.connection_status.set(self.t("Connection ready"))
        self.persist_draft()
        self.status.set(
            self.t("Prefilled from the web page. You can edit before submitting.")
        )
        self._build_ui()
