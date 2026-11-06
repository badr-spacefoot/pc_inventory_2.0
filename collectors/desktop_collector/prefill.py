"""Prefill acquisition and application workflow for the desktop collector."""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.parse
from pathlib import Path
from tkinter import messagebox

try:
    from .config import PREFILL_FILE_MAX_AGE_SECONDS
    from .support import (
        api_error_message,
        api_request,
        launch_prefill_from_args,
        newest_prefill_file,
        downloads_dirs,
        normalize_api_url,
    )
except ImportError:  # Supports direct execution and PyInstaller entry points.
    from config import PREFILL_FILE_MAX_AGE_SECONDS
    from support import (
        api_error_message,
        api_request,
        launch_prefill_from_args,
        newest_prefill_file,
        downloads_dirs,
        normalize_api_url,
    )


class PrefillMixin:
    """Loads prefill profiles from links, files, and the inventory API."""

    def confirm_api_endpoint(self, url: str) -> bool:
        host = urllib.parse.urlsplit(normalize_api_url(url)).hostname
        trusted = {"oletfrcaptvardmdwacy.supabase.co", "parc.piqa.fr", "parc-api.piqa.fr", "api.parc.piqa.fr", "localhost", "127.0.0.1", "::1"}
        approved = getattr(self, "approved_api_hosts", set())
        if host in trusted or host in approved:
            return True
        if not messagebox.askyesno("Inventory server / Serveur d'inventaire", f"Send inventory and profile to this server?\nEnvoyer l'inventaire et le profil à ce serveur ?\n\n{url}"):
            return False
        self.approved_api_hosts = {*approved, host}
        return True

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
        if not isinstance(data, dict):
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
            if not self.confirm_api_endpoint(str(data["apiUrl"])):
                return
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
            raw_endpoint = self.api_url.get()
            endpoint = normalize_api_url(raw_endpoint)
            data = api_request(
                endpoint,
                f"/collect/prefill/{urllib.parse.quote(self.prefill_code.get().strip())}",
                timeout=15,
            )
            self.after(0, lambda: self.apply_prefill(data) if self.api_url.get() == raw_endpoint else None)
        except Exception as exc:
            self.after(0, lambda error=api_error_message(exc): self.status.set(error))

    def apply_prefill(self, data: dict) -> None:
        if data.get("apiUrl"):
            if not self.confirm_api_endpoint(str(data["apiUrl"])):
                return
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
        # A consumed prefill is a temporary credential carrier, not a document.
        loaded = str(getattr(self, "last_loaded_prefill_file", "") or "")
        if loaded:
            path = Path(loaded)
            if path.name.startswith("spacefoot-collector-prefill") and path.suffix == ".json" and path.parent in downloads_dirs():
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
