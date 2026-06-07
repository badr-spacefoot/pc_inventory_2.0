#!/usr/bin/env python3
"""Transparent Spacefoot desktop collector.

This app intentionally uses only the Python standard library. It shows the
collected payload before sending it and does not hide or obfuscate behavior.
"""

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
from tkinter import messagebox, scrolledtext, ttk
import urllib.error
import urllib.request
import uuid
try:
    import winreg
except ImportError:
    winreg = None

try:
    from pathlib import Path
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


class CollectorApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Spacefoot IT Collector")
        self.geometry("880x680")
        self.payload: dict = {}

        self.api_url = tk.StringVar(value=DEFAULT_API_URL)
        self.token = tk.StringVar()
        self.include_mac = tk.BooleanVar(value=False)
        self.status = tk.StringVar(value="Pret.")

        self._build_ui()

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=16)
        root.pack(fill="both", expand=True)

        ttk.Label(root, text="Spacefoot IT Collector", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        ttk.Label(
            root,
            text=(
                "Collecte uniquement les donnees d'inventaire: hostname, OS, fabricant/modele/serial, "
                "CPU/RAM/stockage, IP locale et utilisateur OS. Aucun fichier personnel, mot de passe "
                "ou historique navigateur n'est lu."
            ),
            wraplength=820,
        ).pack(anchor="w", pady=(6, 14))

        form = ttk.Frame(root)
        form.pack(fill="x")
        ttk.Label(form, text="API URL").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.api_url).grid(row=0, column=1, sticky="ew", padx=(10, 0))
        ttk.Label(form, text="Collection token").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(form, textvariable=self.token, show="*").grid(row=1, column=1, sticky="ew", padx=(10, 0), pady=(8, 0))
        ttk.Checkbutton(form, text="Inclure l'adresse MAC si autorisee", variable=self.include_mac).grid(
            row=2,
            column=1,
            sticky="w",
            padx=(10, 0),
            pady=(8, 0),
        )
        form.columnconfigure(1, weight=1)

        actions = ttk.Frame(root)
        actions.pack(fill="x", pady=14)
        ttk.Button(actions, text="Collecter et afficher", command=self.collect).pack(side="left")
        ttk.Button(actions, text="Envoyer apres verification", command=self.submit).pack(side="left", padx=(8, 0))

        self.output = scrolledtext.ScrolledText(root, height=24)
        self.output.pack(fill="both", expand=True)
        ttk.Label(root, textvariable=self.status).pack(anchor="w", pady=(8, 0))

    def collect(self) -> None:
        if collector is None:
            messagebox.showerror("Collecteur indisponible", f"Impossible de charger le collecteur: {COLLECTOR_IMPORT_ERROR}")
            return
        self.status.set("Collecte en cours...")
        self.update_idletasks()
        try:
            self.payload = collector.collect(self.include_mac.get())
        except Exception as exc:  # pragma: no cover - displayed to user
            self.status.set("Collecte en echec.")
            messagebox.showerror("Collecte en echec", str(exc))
            return
        self.output.delete("1.0", tk.END)
        self.output.insert(tk.END, json.dumps(self.payload, indent=2, ensure_ascii=False))
        self.status.set("Donnees collectees. Relisez avant envoi.")

    def submit(self) -> None:
        if not self.payload:
            messagebox.showwarning("Aucune donnee", "Collectez les donnees avant l'envoi.")
            return
        if not self.token.get().strip():
            messagebox.showwarning("Token requis", "Collez le token de collecteur.")
            return
        threading.Thread(target=self._submit_background, daemon=True).start()

    def _submit_background(self) -> None:
        self.status.set("Envoi en cours...")
        body = json.dumps(self.payload).encode("utf-8")
        request = urllib.request.Request(
            f"{self.api_url.get().rstrip('/')}/collect/scan",
            data=body,
            headers={"Authorization": f"Bearer {self.token.get().strip()}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                result = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            self.status.set("Envoi refuse.")
            messagebox.showerror("Envoi refuse", detail or str(exc))
            return
        except urllib.error.URLError as exc:
            self.status.set("Envoi impossible.")
            messagebox.showerror("Envoi impossible", str(exc.reason))
            return
        self.status.set(f"Inventaire envoye. Machine: {result.get('deviceId', 'inconnue')}")
        messagebox.showinfo("Succes", "Inventaire envoye avec succes.")


if __name__ == "__main__":
    CollectorApp().mainloop()
