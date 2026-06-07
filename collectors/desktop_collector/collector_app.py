#!/usr/bin/env python3
"""Spacefoot desktop collector with transparent step-by-step UX."""

from __future__ import annotations

import argparse
import ctypes
import datetime
import getpass
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext, ttk
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    import winreg
except ImportError:
    winreg = None

try:
    import importlib.util

    if getattr(sys, "frozen", False):
        SCRIPT_PATH = Path(getattr(sys, "_MEIPASS")) / "scripts" / "collect-cross-platform.py"
    else:
        SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "collect-cross-platform.py"
    SPEC = importlib.util.spec_from_file_location("spacefoot_cross_collector", SCRIPT_PATH)
    collector = importlib.util.module_from_spec(SPEC)
    assert SPEC and SPEC.loader
    SPEC.loader.exec_module(collector)
except Exception as exc:  # pragma: no cover - visible UI fallback
    collector = None
    COLLECTOR_IMPORT_ERROR = exc
else:
    COLLECTOR_IMPORT_ERROR = None


DEFAULT_API_URL = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"
DRAFT_PATH = Path.home() / ".spacefoot_it_collector.json"
COLORS = {
    "bg": "#1d241f",
    "panel": "#252d28",
    "panel_2": "#2d3831",
    "line": "#3c473f",
    "text": "#edf4ee",
    "muted": "#aab6ad",
    "brand": "#1f8a70",
    "brand_2": "#43c0a3",
    "danger": "#ef4444",
    "warning": "#eab308",
    "success": "#22c55e",
    "input": "#1a211d",
}


def load_draft() -> dict:
    try:
        return json.loads(DRAFT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_draft(values: dict) -> None:
    try:
        DRAFT_PATH.write_text(json.dumps(values, indent=2), encoding="utf-8")
    except OSError:
        pass


def clear_sensitive_draft() -> None:
    draft = load_draft()
    api_url = draft.get("apiUrl") or DEFAULT_API_URL
    save_draft({"apiUrl": api_url})


def api_request(api_url: str, path: str, method="GET", body=None, headers=None, timeout=25):
    url = f"{api_url.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def api_error_message(exc: Exception) -> str:
    if isinstance(exc, urllib.error.HTTPError):
        detail = exc.read().decode("utf-8", errors="ignore")
        try:
            return json.loads(detail).get("error", detail) or str(exc)
        except json.JSONDecodeError:
            return detail or str(exc)
    if isinstance(exc, urllib.error.URLError):
        return f"API unreachable: {exc.reason}"
    return str(exc)


def money_text(value):
    return "-" if value in (None, "") else str(value)


class CollectorApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Spacefoot IT Collector")
        self.geometry("1120x760")
        self.minsize(980, 680)
        self.configure(bg=COLORS["bg"])
        self.payload: dict = {}
        self.collection_token = ""
        self.teams: list[dict] = []
        self.establishments: list[dict] = []
        self.step_index = 0
        self.step_frames: list[tk.Frame] = []
        draft = load_draft()

        self.api_url = tk.StringVar(value=draft.get("apiUrl") or DEFAULT_API_URL)
        self.access_token = tk.StringVar(value=draft.get("accessToken") or "")
        self.first_name = tk.StringVar(value=draft.get("firstName") or "")
        self.last_name = tk.StringVar(value=draft.get("lastName") or "")
        self.email = tk.StringVar(value=draft.get("email") or "")
        self.team = tk.StringVar(value=draft.get("team") or "")
        self.establishment = tk.StringVar(value=draft.get("establishment") or "")
        self.proposed_team = tk.StringVar(value=draft.get("proposedTeam") or "")
        self.proposed_establishment = tk.StringVar(value=draft.get("proposedEstablishment") or "")
        self.comment = tk.StringVar(value=draft.get("comment") or "")
        self.include_mac = tk.BooleanVar(value=bool(draft.get("includeMac", False)))
        self.status = tk.StringVar(value="Ready.")
        self.connection_status = tk.StringVar(value="Not validated.")

        self._build_ui()
        self._bind_draft_saves()
        self.after(300, self.load_organization_background)

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        shell = tk.Frame(self, bg=COLORS["bg"], padx=24, pady=20)
        shell.grid(row=0, column=0, sticky="nsew")
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(2, weight=1)

        header = tk.Frame(shell, bg=COLORS["bg"])
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        tk.Label(header, text="SPACEFOOT", fg=COLORS["brand_2"], bg=COLORS["bg"], font=("Segoe UI", 9, "bold")).grid(row=0, column=0, sticky="w")
        tk.Label(header, text="IT Collector", fg=COLORS["text"], bg=COLORS["bg"], font=("Segoe UI", 26, "bold")).grid(row=1, column=0, sticky="w")
        tk.Label(
            header,
            text="This collector gathers only inventory information needed by the IT team.",
            fg=COLORS["muted"],
            bg=COLORS["bg"],
            font=("Segoe UI", 10),
        ).grid(row=2, column=0, sticky="w", pady=(4, 0))

        self.step_nav = tk.Frame(shell, bg=COLORS["bg"])
        self.step_nav.grid(row=1, column=0, sticky="ew", pady=(18, 14))
        for index, label in enumerate(["Connection", "Assignment", "Hardware scan", "Review & submit"]):
            chip = tk.Label(self.step_nav, text=f"{index + 1}. {label}", padx=14, pady=8, font=("Segoe UI", 10, "bold"))
            chip.grid(row=0, column=index, sticky="w", padx=(0, 8))
            setattr(self, f"step_chip_{index}", chip)

        self.content = tk.Frame(shell, bg=COLORS["bg"])
        self.content.grid(row=2, column=0, sticky="nsew")
        self.content.columnconfigure(0, weight=1)
        self.content.rowconfigure(0, weight=1)

        self.step_frames = [
            self._connection_step(),
            self._assignment_step(),
            self._scan_step(),
            self._review_step(),
        ]
        footer = tk.Frame(shell, bg=COLORS["bg"])
        footer.grid(row=3, column=0, sticky="ew", pady=(14, 0))
        footer.columnconfigure(1, weight=1)
        self.back_button = self.button(footer, "Back", self.previous_step, secondary=True)
        self.back_button.grid(row=0, column=0, padx=(0, 8))
        tk.Label(footer, textvariable=self.status, fg=COLORS["muted"], bg=COLORS["bg"], font=("Segoe UI", 10)).grid(row=0, column=1, sticky="w")
        self.next_button = self.button(footer, "Next", self.next_step)
        self.next_button.grid(row=0, column=2)
        self.show_step(0)

    def card(self, parent) -> tk.Frame:
        frame = tk.Frame(parent, bg=COLORS["panel"], padx=18, pady=16, highlightbackground=COLORS["line"], highlightthickness=1)
        return frame

    def label(self, parent, text, size=10, muted=False, bold=False):
        return tk.Label(
            parent,
            text=text,
            fg=COLORS["muted"] if muted else COLORS["text"],
            bg=parent["bg"],
            font=("Segoe UI", size, "bold" if bold else "normal"),
        )

    def entry(self, parent, variable, show=None):
        item = tk.Entry(
            parent,
            textvariable=variable,
            show=show,
            bg=COLORS["input"],
            fg=COLORS["text"],
            insertbackground=COLORS["text"],
            relief="flat",
            highlightthickness=1,
            highlightbackground=COLORS["line"],
            highlightcolor=COLORS["brand_2"],
            font=("Segoe UI", 10),
        )
        return item

    def combo(self, parent, variable, values):
        combo = ttk.Combobox(parent, textvariable=variable, values=values, state="readonly")
        return combo

    def button(self, parent, text, command, secondary=False):
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=COLORS["panel_2"] if secondary else COLORS["brand"],
            fg=COLORS["text"],
            activebackground=COLORS["brand_2"],
            activeforeground="#0c1511",
            relief="flat",
            padx=16,
            pady=9,
            font=("Segoe UI", 10, "bold"),
            cursor="hand2",
        )

    def _connection_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)
        self.label(card, "Connection", 17, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
        self.label(card, "Validate the API and collection access token before creating the scan token.", muted=True).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 16))
        self.label(card, "API URL", bold=True).grid(row=2, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.api_url).grid(row=2, column=1, sticky="ew", pady=8)
        self.label(card, "Collection access token", bold=True).grid(row=3, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.access_token, show="*").grid(row=3, column=1, sticky="ew", pady=8)
        tk.Checkbutton(
            card,
            text="Include MAC address if authorized",
            variable=self.include_mac,
            bg=COLORS["panel"],
            fg=COLORS["text"],
            activebackground=COLORS["panel"],
            activeforeground=COLORS["text"],
            selectcolor=COLORS["input"],
        ).grid(row=4, column=1, sticky="w", pady=(6, 12))
        self.button(card, "Validate token", self.validate_token, secondary=True).grid(row=5, column=0, sticky="w", pady=(8, 0))
        tk.Label(card, textvariable=self.connection_status, fg=COLORS["brand_2"], bg=COLORS["panel"], font=("Segoe UI", 10, "bold")).grid(row=5, column=1, sticky="w", padx=(10, 0), pady=(8, 0))
        self._privacy_card(frame).grid(row=1, column=0, sticky="ew", pady=(14, 0))
        return frame

    def _privacy_card(self, parent):
        card = self.card(parent)
        self.label(card, "Data transparency", 14, bold=True).grid(row=0, column=0, sticky="w")
        lines = [
            "No personal files are read.",
            "No browser history is read.",
            "No passwords are read.",
            "No remote control is installed.",
            "Data is submitted only after user confirmation.",
        ]
        for index, line in enumerate(lines, start=1):
            tk.Label(card, text=f"- {line}", fg=COLORS["muted"], bg=COLORS["panel"], font=("Segoe UI", 10)).grid(row=index, column=0, sticky="w", pady=2)
        return card

    def _assignment_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)
        self.label(card, "User assignment", 17, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
        self.label(card, "Teams and locations are loaded from the admin-managed values.", muted=True).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 16))
        fields = [
            ("First name", self.first_name),
            ("Last name", self.last_name),
            ("Email", self.email),
        ]
        for row, (label, variable) in enumerate(fields, start=2):
            self.label(card, label, bold=True).grid(row=row, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(card, variable).grid(row=row, column=1, sticky="ew", pady=8)
        self.label(card, "Team", bold=True).grid(row=5, column=0, sticky="w", padx=(0, 12), pady=8)
        self.team_combo = self.combo(card, self.team, [])
        self.team_combo.grid(row=5, column=1, sticky="ew", pady=8)
        self.label(card, "Other team proposal", bold=True).grid(row=6, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.proposed_team).grid(row=6, column=1, sticky="ew", pady=8)
        self.label(card, "Location", bold=True).grid(row=7, column=0, sticky="w", padx=(0, 12), pady=8)
        self.establishment_combo = self.combo(card, self.establishment, [])
        self.establishment_combo.grid(row=7, column=1, sticky="ew", pady=8)
        self.label(card, "Other location proposal", bold=True).grid(row=8, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.proposed_establishment).grid(row=8, column=1, sticky="ew", pady=8)
        self.label(card, "Comment", bold=True).grid(row=9, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.comment).grid(row=9, column=1, sticky="ew", pady=8)
        return frame

    def _scan_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        self.label(card, "Hardware scan", 17, bold=True).grid(row=0, column=0, sticky="w")
        self.label(card, "Scan this computer, then review the summary before submission.", muted=True).grid(row=1, column=0, sticky="w", pady=(4, 12))
        self.button(card, "Scan this computer", self.scan_computer).grid(row=2, column=0, sticky="w")
        self.summary = tk.Frame(frame, bg=COLORS["bg"])
        self.summary.grid(row=1, column=0, sticky="nsew", pady=(14, 0))
        self.summary.columnconfigure(0, weight=1)
        return frame

    def _review_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        self.label(card, "Review & submit", 17, bold=True).grid(row=0, column=0, sticky="w")
        self.label(card, "Create the collection profile, then submit the reviewed scan.", muted=True).grid(row=1, column=0, sticky="w", pady=(4, 12))
        self.button(card, "Submit inventory", self.submit_inventory).grid(row=2, column=0, sticky="w")
        self.raw_visible = tk.BooleanVar(value=False)
        self.raw_toggle = self.button(frame, "Show Advanced / Raw JSON", self.toggle_raw_json, secondary=True)
        self.raw_toggle.grid(row=1, column=0, sticky="w", pady=(14, 0))
        self.raw_card = self.card(frame)
        self.raw_card.grid(row=2, column=0, sticky="nsew", pady=(10, 0))
        self.raw_card.grid_remove()
        self.raw_card.columnconfigure(0, weight=1)
        self.raw_card.rowconfigure(1, weight=1)
        self.label(self.raw_card, "Advanced / Raw JSON", 14, bold=True).grid(row=0, column=0, sticky="w")
        self.raw_output = scrolledtext.ScrolledText(self.raw_card, height=18, bg=COLORS["input"], fg=COLORS["text"], insertbackground=COLORS["text"], relief="flat")
        self.raw_output.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        return frame

    def toggle_raw_json(self) -> None:
        visible = not self.raw_visible.get()
        self.raw_visible.set(visible)
        if visible:
            self.raw_card.grid()
            self.raw_toggle.configure(text="Hide Advanced / Raw JSON")
        else:
            self.raw_card.grid_remove()
            self.raw_toggle.configure(text="Show Advanced / Raw JSON")

    def _bind_draft_saves(self) -> None:
        variables = [
            self.api_url, self.access_token, self.first_name, self.last_name, self.email, self.team,
            self.establishment, self.proposed_team, self.proposed_establishment, self.comment,
        ]
        for variable in variables:
            variable.trace_add("write", lambda *_: self.persist_draft())
        self.include_mac.trace_add("write", lambda *_: self.persist_draft())

    def persist_draft(self) -> None:
        save_draft({
            "apiUrl": self.api_url.get().strip(),
            "accessToken": self.access_token.get().strip(),
            "firstName": self.first_name.get().strip(),
            "lastName": self.last_name.get().strip(),
            "email": self.email.get().strip(),
            "team": self.team.get().strip(),
            "establishment": self.establishment.get().strip(),
            "proposedTeam": self.proposed_team.get().strip(),
            "proposedEstablishment": self.proposed_establishment.get().strip(),
            "comment": self.comment.get().strip(),
            "includeMac": self.include_mac.get(),
        })

    def show_step(self, index: int) -> None:
        self.step_index = max(0, min(index, len(self.step_frames) - 1))
        for frame in self.step_frames:
            frame.grid_remove()
        self.step_frames[self.step_index].grid()
        for index, chip in enumerate(getattr(self, f"step_chip_{i}") for i in range(4)):
            active = index == self.step_index
            chip.configure(bg=COLORS["brand"] if active else COLORS["panel"], fg=COLORS["text"] if active else COLORS["muted"])
        self.back_button.configure(state="normal" if self.step_index > 0 else "disabled")
        self.next_button.configure(text="Next" if self.step_index < 3 else "Done", state="normal" if self.step_index < 3 else "disabled")

    def next_step(self) -> None:
        if self.step_index == 0 and not self.api_url.get().strip():
            messagebox.showwarning("API URL required", "Please enter the API URL.")
            return
        self.show_step(self.step_index + 1)

    def previous_step(self) -> None:
        self.show_step(self.step_index - 1)

    def load_organization_background(self) -> None:
        threading.Thread(target=self._load_organization, daemon=True).start()

    def _load_organization(self) -> None:
        try:
            data = api_request(self.api_url.get().strip(), "/organization", timeout=15)
            self.teams = data.get("teams") or []
            self.establishments = data.get("establishments") or []
            self.after(0, self.update_org_controls)
        except Exception as exc:
            self.after(0, lambda: self.status.set(api_error_message(exc)))

    def update_org_controls(self) -> None:
        team_values = [self.org_label(item) for item in self.teams if item.get("name")] + ["Other"]
        site_values = [self.org_label(item) for item in self.establishments if item.get("name")] + ["Other"]
        self.team_combo.configure(values=team_values)
        self.establishment_combo.configure(values=site_values)
        self.status.set(f"Loaded {len(self.teams)} teams and {len(self.establishments)} locations.")

    def org_label(self, item: dict) -> str:
        name = item.get("name", "")
        abbreviation = item.get("abbreviation", "")
        return f"{abbreviation} - {name}" if abbreviation else name

    def org_name_from_label(self, value: str, items: list[dict]) -> str:
        if value == "Other":
            return value
        for item in items:
            if value == item.get("name") or value == self.org_label(item):
                return item.get("name", "")
        return value

    def validate_token(self) -> None:
        if not self.access_token.get().strip():
            messagebox.showwarning("Token required", "Please enter the collection access token.")
            return
        self.connection_status.set("Validating...")
        threading.Thread(target=self._validate_token, daemon=True).start()

    def _validate_token(self) -> None:
        try:
            data = api_request(
                self.api_url.get().strip(),
                "/collect/access-token/validate",
                method="POST",
                headers={"X-Collection-Access-Token": self.access_token.get().strip()},
                body={},
            )
            label = data.get("label") or "collection token"
            self.after(0, lambda: self.connection_status.set(f"Token valid: {label}"))
            self._load_organization()
        except Exception as exc:
            self.after(0, lambda: self.connection_status.set(api_error_message(exc)))

    def scan_computer(self) -> None:
        if collector is None:
            messagebox.showerror("Collector unavailable", f"Unable to load collector: {COLLECTOR_IMPORT_ERROR}")
            return
        self.status.set("Scanning hardware...")
        threading.Thread(target=self._scan_background, daemon=True).start()

    def _scan_background(self) -> None:
        try:
            payload = collector.collect(self.include_mac.get())
            self.payload = payload
            self.after(0, self.render_scan_summary)
        except Exception as exc:
            self.after(0, lambda: messagebox.showerror("Scan failed", str(exc)))
            self.after(0, lambda: self.status.set("Scan failed."))

    def value_card(self, parent, row, column, title, value, accent=False):
        card = self.card(parent)
        card.grid(row=row, column=column, sticky="nsew", padx=6, pady=6)
        parent.columnconfigure(column, weight=1)
        self.label(card, title.upper(), 8, muted=True, bold=True).grid(row=0, column=0, sticky="w")
        tk.Label(
            card,
            text=money_text(value),
            fg=COLORS["brand_2"] if accent else COLORS["text"],
            bg=COLORS["panel"],
            wraplength=320,
            justify="left",
            font=("Segoe UI", 11, "bold" if accent else "normal"),
        ).grid(row=1, column=0, sticky="w", pady=(6, 0))

    def render_scan_summary(self) -> None:
        for child in self.summary.winfo_children():
            child.destroy()
        p = self.payload
        identity = p.get("hardwareIdentity") or {}
        items = [
            ("OS", f"{p.get('osName', '')} {p.get('osVersion', '')}".strip()),
            ("Manufacturer", p.get("manufacturer")),
            ("Model", p.get("model"), True),
            ("Model number / SKU", p.get("modelNumber") or identity.get("systemSku")),
            ("Serial / Service tag", p.get("serialNumber") or p.get("serviceTag") or identity.get("serviceTag")),
            ("CPU", p.get("cpu")),
            ("RAM", f"{p.get('ramTotalGb')} GB" if p.get("ramTotalGb") else ""),
            ("Storage", f"{p.get('storageTotalGb')} GB total / {p.get('storageFreeGb')} GB free"),
            ("GPU", p.get("gpu")),
            ("Network", f"IP {p.get('localIp') or '-'} / MAC {p.get('macAddress') or '-'}"),
        ]
        for index, item in enumerate(items):
            title, value, *rest = item
            self.value_card(self.summary, index // 2, index % 2, title, value, bool(rest and rest[0]))
        missing = [title for title, value, *_ in items if not value or value == "-"]
        if missing:
            self.status.set(f"Scan completed with unavailable fields: {', '.join(missing)}.")
        else:
            self.status.set("Scan completed.")
        self.raw_output.delete("1.0", tk.END)
        self.raw_output.insert(tk.END, json.dumps(self.payload, indent=2, ensure_ascii=False))

    def profile_body(self) -> dict:
        team = self.org_name_from_label(self.team.get().strip(), self.teams)
        site = self.org_name_from_label(self.establishment.get().strip(), self.establishments)
        return {
            "firstName": self.first_name.get().strip(),
            "lastName": self.last_name.get().strip(),
            "email": self.email.get().strip(),
            "team": "" if team == "Other" else team,
            "establishment": "" if site == "Other" else site,
            "proposedTeam": self.proposed_team.get().strip() if team == "Other" else "",
            "proposedEstablishment": self.proposed_establishment.get().strip() if site == "Other" else "",
            "comment": self.comment.get().strip(),
        }

    def submit_inventory(self) -> None:
        if not self.payload:
            messagebox.showwarning("No scan", "Scan this computer before submitting.")
            return
        body = self.profile_body()
        missing = [field for field in ["firstName", "lastName", "email"] if not body[field]]
        if not body["team"] and not body["proposedTeam"]:
            missing.append("team or other team proposal")
        if not body["establishment"] and not body["proposedEstablishment"]:
            missing.append("location or other location proposal")
        if missing:
            messagebox.showwarning("Missing fields", f"Please complete: {', '.join(missing)}")
            return
        self.status.set("Creating collection profile...")
        threading.Thread(target=self._submit_background, daemon=True).start()

    def _submit_background(self) -> None:
        try:
            profile = api_request(
                self.api_url.get().strip(),
                "/collect/profile",
                method="POST",
                headers={"X-Collection-Access-Token": self.access_token.get().strip()},
                body=self.profile_body(),
            )
            token = profile.get("collectionToken")
            if not token:
                raise RuntimeError("API did not return a collection token.")
            request_body = json.dumps(self.payload).encode("utf-8")
            request = urllib.request.Request(
                f"{self.api_url.get().rstrip('/')}/collect/scan",
                data=request_body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=25) as response:
                result = json.loads(response.read().decode("utf-8"))
            clear_sensitive_draft()
            self.after(0, lambda: self.status.set(f"Submission successful. Device: {result.get('deviceId', 'unknown')}"))
            self.after(0, lambda: messagebox.showinfo("Success", "Inventory submitted successfully."))
        except Exception as exc:
            self.after(0, lambda: self.status.set(f"Submission failed: {api_error_message(exc)}"))
            self.after(0, lambda: messagebox.showerror("Submission failed", api_error_message(exc)))


if __name__ == "__main__":
    CollectorApp().mainloop()
