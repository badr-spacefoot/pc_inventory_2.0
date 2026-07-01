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
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
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
COLLECTOR_VERSION = "0.1.40"
COLLECTOR_BUILD_CHANNEL = "github-release"
COLLECTOR_RELEASES_URL = "https://badr-spacefoot.github.io/pc_inventory_2.0/collector-releases.json"
DRAFT_PATH = Path.home() / ".spacefoot_it_collector.json"
PREFILL_FILE_MAX_AGE_SECONDS = 24 * 60 * 60
DARK_COLORS = {
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
LIGHT_COLORS = {
    "bg": "#eef1ed",
    "panel": "#ffffff",
    "panel_2": "#e4ebe5",
    "line": "#cbd5ce",
    "text": "#202a24",
    "muted": "#5f6f66",
    "brand": "#1f8a70",
    "brand_2": "#087966",
    "danger": "#dc2626",
    "warning": "#b7791f",
    "success": "#15803d",
    "input": "#f7faf8",
}
COLORS = DARK_COLORS.copy()


def bundled_asset_path(relative_path: str) -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")) / relative_path
    return Path(__file__).resolve().parents[2] / "frontend" / relative_path

TRANSLATIONS = {
    "fr": {
        "IT Collector": "Collecteur IT",
        "This collector gathers only inventory information needed by the IT team.": "Ce collecteur récupère uniquement les informations d'inventaire utiles à l'équipe IT.",
        "Connection": "Connexion",
        "Assignment": "Affectation",
        "Hardware scan": "Scan matériel",
        "Review & submit": "Relecture & envoi",
        "Validate the API and collection access token before creating the scan token.": "Validez l'API et le token temporaire avant de créer le token de scan.",
        "API URL": "URL API",
        "Collection access token": "Token temporaire de collecte",
        "Use an admin-generated temporary token, not the collector token shown after web collection.": "Utilisez un token temporaire généré dans l'admin, pas le token collecteur affiché après la collecte web.",
        "Include MAC address if authorized": "Inclure l'adresse MAC si autorisée",
        "Validate token": "Valider le token",
        "Token required": "Token requis",
        "Please enter the collection access token.": "Veuillez saisir le token temporaire de collecte.",
        "Validating...": "Validation...",
        "Token valid": "Token valide",
        "Invalid collection access token. Generate a temporary token in Admin > Collection tokens.": "Token temporaire invalide. Générez un token dans Admin > Tokens temporaires.",
        "Data transparency": "Transparence des données",
        "No personal files are read.": "Aucun fichier personnel n'est lu.",
        "No browser history is read.": "Aucun historique navigateur n'est lu.",
        "No passwords are read.": "Aucun mot de passe n'est lu.",
        "No remote control is installed.": "Aucun contrôle à distance n'est installé.",
        "Data is submitted only after user confirmation.": "Les données sont envoyées uniquement après confirmation.",
        "User": "Utilisateur",
        "User assignment": "Affectation utilisateur",
        "Teams and locations are loaded from the admin-managed values.": "Les équipes et établissements sont chargés depuis les valeurs admin.",
        "First name": "Prénom",
        "Last name": "Nom",
        "Email": "Email",
        "Team": "Équipe",
        "Other team proposal": "Proposition autre équipe",
        "Location": "Établissement",
        "Other location proposal": "Proposition autre établissement",
        "Comment": "Commentaire",
        "Other": "Autre",
        "Scan this computer, then review the summary before submission.": "Scannez cet ordinateur, puis relisez le résumé avant envoi.",
        "Scan this computer": "Scanner cet ordinateur",
        "Review & submit": "Relecture & envoi",
        "Create the collection profile, then submit the reviewed scan.": "Créez le profil de collecte, puis envoyez le scan relu.",
        "Submit inventory": "Envoyer l'inventaire",
        "Show Advanced / Raw JSON": "Afficher avancé / JSON brut",
        "Hide Advanced / Raw JSON": "Masquer avancé / JSON brut",
        "Advanced / Raw JSON": "Avancé / JSON brut",
        "Ready.": "Prêt.",
        "Not validated.": "Non valide.",
        "Back": "Retour",
        "Next": "Suivant",
        "Done": "Terminé",
        "API URL required": "URL API requise",
        "Please enter the API URL.": "Veuillez saisir l'URL API.",
        "Loaded": "Chargé",
        "teams and": "équipes et",
        "locations.": "établissements.",
        "Collector unavailable": "Collecteur indisponible",
        "Unable to load collector": "Impossible de charger le collecteur",
        "Scanning hardware...": "Scan matériel...",
        "Scan failed": "Scan échoué",
        "OS": "OS",
        "Manufacturer": "Fabricant",
        "Model": "Modèle",
        "Model number / SKU": "Numéro modèle / SKU",
        "Serial / Service tag": "Série / Service tag",
        "CPU": "CPU",
        "RAM": "RAM",
        "Memory details": "Détails mémoire",
        "Storage": "Stockage",
        "GPU": "GPU",
        "Network": "Réseau",
        "total": "total",
        "free": "libres",
        "usable": "utilisables",
        "installed": "installés",
        "IP": "IP",
        "MAC": "MAC",
        "Scan completed.": "Scan terminé.",
        "Scan completed with unavailable fields": "Scan terminé avec champs indisponibles",
        "No scan": "Aucun scan",
        "Scan this computer before submitting.": "Scannez cet ordinateur avant l'envoi.",
        "Missing fields": "Champs manquants",
        "Please complete": "Veuillez compléter",
        "team or other team proposal": "équipe ou proposition autre équipe",
        "location or other location proposal": "établissement ou proposition autre établissement",
        "Creating collection profile...": "Création du profil de collecte...",
        "API did not return a collection token.": "L'API n'a pas retourné de token de scan.",
        "Success": "Succès",
        "Inventory submitted successfully.": "Inventaire envoyé avec succès.",
        "Submission complete. You can close the collector.": "Envoi terminé. Vous pouvez fermer le collecteur.",
        "Submission successful. Device": "Envoi réussi. Machine",
        "Submission sent": "Envoi réussi",
        "Device ID": "ID machine",
        "The inventory was received by Spacefoot. You can close the collector.": "L'inventaire a bien été reçu par Spacefoot. Vous pouvez fermer le collecteur.",
        "Submission failed": "Échec de l'envoi",
        "Theme": "Thème",
        "System": "Système",
        "Dark": "Sombre",
        "Light": "Clair",
        "Version": "Version",
        "Prefill code": "Code de pré-remplissage",
        "Please enter the prefill code.": "Veuillez saisir le code de pré-remplissage.",
        "Load prefill": "Charger le pré-remplissage",
        "Prefilled from the web page. You can edit before submitting.": "Pré-rempli depuis la page web. Vous pouvez modifier avant l'envoi.",
        "Prefill link received. Loading profile...": "Lien de pré-remplissage reçu. Chargement du profil...",
        "Checking collector version...": "Vérification de la version du collecteur...",
        "Downloading collector update...": "Téléchargement de la mise à jour du collecteur...",
        "Installing update. The collector will reopen automatically.": "Installation de la mise à jour. Le collecteur se rouvrira automatiquement.",
        "Collector update ready": "Mise à jour du collecteur prête",
        "A new collector version has been downloaded. Windows will now ask for permission to run the installer. Click Yes or Run. The collector will reopen automatically with the prefilled profile.": "Une nouvelle version du collecteur a été téléchargée. Windows va maintenant demander l'autorisation d'exécuter l'installateur. Cliquez sur Oui ou Exécuter. Le collecteur se rouvrira automatiquement avec le profil pré-rempli.",
        "A new collector version has been downloaded. Ubuntu will now ask for your password in a terminal to install the update. The collector will reopen automatically with the prefilled profile.": "Une nouvelle version du collecteur a été téléchargée. Ubuntu va maintenant demander votre mot de passe dans un terminal pour installer la mise à jour. Le collecteur se rouvrira automatiquement avec le profil pré-rempli.",
        "Unable to open a terminal for the update. Run this command, then reopen the collector from the web page:": "Impossible d'ouvrir un terminal pour la mise à jour. Lancez cette commande, puis rouvrez le collecteur depuis la page web :",
        "Waiting for Ubuntu to finish installing the update...": "En attente de la fin d'installation de la mise à jour Ubuntu...",
        "Update did not finish. Loading current collector.": "La mise à jour n'a pas abouti. Chargement avec le collecteur actuel.",
        "Update check failed. Loading current collector.": "Vérification de mise à jour impossible. Chargement avec le collecteur actuel.",
        "Update collector automatically before loading a prefilled profile": "Mettre à jour automatiquement le collecteur avant de charger un profil pré-rempli",
        "Collector purpose": "Objectif du collecteur",
        "The IT team uses this tool to keep the fleet inventory accurate. Review everything before sending.": "L'équipe IT utilise cet outil pour maintenir l'inventaire du parc à jour. Relisez tout avant l'envoi.",
        "Collected data": "Données collectées",
        "Connection settings": "Réglages de connexion",
        "Show connection settings": "Afficher les réglages de connexion",
        "Hide connection settings": "Masquer les réglages de connexion",
        "Prefill file loaded automatically. You can edit before submitting.": "Fichier de pré-remplissage chargé automatiquement. Vous pouvez modifier avant l'envoi.",
        "Scan log": "Journal du scan",
        "Hostname, OS, manufacturer, model, serial/service tag": "Hostname, OS, fabricant, modèle, numéro de série/service tag",
        "CPU, RAM, storage, GPU if available": "CPU, RAM, stockage, GPU si disponible",
        "Local IP, MAC if authorized, logged-in OS user": "IP locale, MAC si autorisée, utilisateur OS connecté",
        "Ready to scan": "Prêt à scanner",
        "Profile ready": "Profil prêt",
        "Missing profile information": "Informations de profil manquantes",
        "Edit profile": "Modifier le profil",
        "Hide profile": "Masquer le profil",
        "Advanced options": "Options avancées",
        "Hide advanced options": "Masquer les options avancées",
        "Scan summary": "Résumé du scan",
        "Inventory ready to submit.": "Inventaire prêt à envoyer.",
        "Scan again": "Scanner à nouveau",
        "Connection ready": "Connexion prête",
        "Waiting for prefill": "En attente du pré-remplissage",
        "Loaded profile": "Profil chargé",
        "Review the information, scan this computer, then submit.": "Vérifiez les informations, scannez cet ordinateur, puis envoyez.",
        "Only missing information is shown. Advanced settings stay available for support.": "Seules les informations manquantes sont affichées. Les réglages avancés restent disponibles pour le support.",
        "Profile": "Profil",
        "Scan": "Scan",
        "Submit": "Envoi",
        "Check profile information before continuing.": "Vérifiez le profil avant de continuer.",
    }
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
    api_url = normalize_api_url(draft.get("apiUrl") or DEFAULT_API_URL)
    save_draft({"apiUrl": api_url})


def normalize_api_url(value: str) -> str:
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


def version_tuple(value: str) -> tuple[int, ...]:
    text = str(value or "").strip().lower().replace("collector-v", "").lstrip("v")
    parts = re.findall(r"\d+", text)
    return tuple(int(part) for part in parts[:4]) or (0,)


def is_newer_version(candidate: str, current: str) -> bool:
    left = version_tuple(candidate)
    right = version_tuple(current)
    size = max(len(left), len(right))
    return left + (0,) * (size - len(left)) > right + (0,) * (size - len(right))


def fetch_json_url(url: str, timeout=10) -> dict:
    separator = "&" if "?" in url else "?"
    uncached_url = f"{url}{separator}v={int(time.time())}"
    request = urllib.request.Request(uncached_url, headers={
        "User-Agent": f"spacefoot-it-collector/{COLLECTOR_VERSION}",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def download_file(url: str, destination: Path, timeout=60) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": f"spacefoot-it-collector/{COLLECTOR_VERSION}"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        with destination.open("wb") as output:
            shutil.copyfileobj(response, output)


def api_request(api_url: str, path: str, method="GET", body=None, headers=None, timeout=25):
    url = f"{normalize_api_url(api_url).rstrip('/')}{path}"
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


def as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compact_number(value, digits=0):
    number = as_float(value)
    if number is None:
        return ""
    if digits == 0:
        return str(int(round(number)))
    return f"{number:.{digits}f}".rstrip("0").rstrip(".")


def downloads_dirs() -> list[Path]:
    home = Path.home()
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
    match = re.search(r'^XDG_DOWNLOAD_DIR=(?P<quote>["\'])(?P<path>.*?)(?P=quote)', content, flags=re.MULTILINE)
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


def newest_prefill_file() -> Path | None:
    candidates: list[Path] = []
    for directory in downloads_dirs():
        try:
            candidates.extend(directory.glob("spacefoot-collector-prefill*.json"))
        except OSError:
            continue
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def os_icon_name(os_name: str) -> str:
    text = str(os_name or "").lower()
    if "windows" in text:
        return "WIN"
    if "mac" in text or "darwin" in text:
        return "MAC"
    if "linux" in text:
        return "LNX"
    return "OS"


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
    content = "\n".join([
        "[Desktop Entry]",
        "Type=Application",
        "Name=Spacefoot IT Collector",
        "Comment=Spacefoot hardware inventory collector",
        f"Exec={exec_line}",
        "Terminal=false",
        "Categories=Utility;",
        "MimeType=x-scheme-handler/spacefoot-collector;",
        "",
    ])
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


def launch_prefill_from_args(argv: list[str]) -> dict:
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
        result["prefillCode"] = result["prefillCode"] or (params.get("prefillCode") or [""])[0].strip()
        result["apiUrl"] = result["apiUrl"] or normalize_api_url((params.get("apiUrl") or [""])[0])
    return {key: value for key, value in result.items() if value}


class ThemedButton(tk.Label):
    def __init__(self, parent, text, command, secondary=False):
        self.command = command
        self.secondary = secondary
        self._state = "normal"
        self.normal_bg = COLORS["panel_2"] if secondary else COLORS["brand"]
        self.hover_bg = COLORS["line"] if secondary else COLORS["brand_2"]
        self.disabled_bg = COLORS["panel"]
        self.normal_fg = COLORS["text"]
        self.disabled_fg = COLORS["muted"]
        super().__init__(
            parent,
            text=text,
            bg=self.normal_bg,
            fg=self.normal_fg,
            padx=16,
            pady=9,
            font=("Segoe UI", 10, "bold"),
            cursor="hand2",
            borderwidth=0,
            highlightthickness=0,
        )
        self.bind("<Button-1>", self._click)
        self.bind("<Return>", self._click)
        self.bind("<Enter>", self._hover)
        self.bind("<Leave>", self._leave)

    def _click(self, _event=None):
        if self._state != "disabled" and self.command:
            return self.command()
        return None

    def _hover(self, _event=None) -> None:
        if self._state != "disabled":
            tk.Label.configure(self, bg=self.hover_bg)

    def _leave(self, _event=None) -> None:
        self._sync_visual()

    def _sync_visual(self) -> None:
        if self._state == "disabled":
            tk.Label.configure(self, bg=self.disabled_bg, fg=self.disabled_fg, cursor="")
        else:
            tk.Label.configure(self, bg=self.normal_bg, fg=self.normal_fg, cursor="hand2")

    def configure(self, cnf=None, **kwargs):
        options = {}
        if cnf:
            options.update(cnf)
        options.update(kwargs)
        if "state" in options:
            self._state = str(options.pop("state") or "normal")
        if "command" in options:
            self.command = options.pop("command")
        if "text" in options:
            tk.Label.configure(self, text=options.pop("text"))
        if options:
            tk.Label.configure(self, **options)
        self._sync_visual()

    config = configure

    def cget(self, key):
        if key == "state":
            return self._state
        return tk.Label.cget(self, key)


class CollectorApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"Spacefoot IT Collector {COLLECTOR_VERSION}")
        self._set_window_icon()
        self.geometry("1180x840")
        self.minsize(1040, 760)
        self.configure(bg=COLORS["bg"])
        self.payload: dict = {}
        self.submitted = False
        self.submission_device_id = ""
        self.collection_token = ""
        self.handled_launch_urls: set[str] = set()
        self.prefill_watch_active = False
        register_linux_url_scheme()
        self.teams: list[dict] = []
        self.establishments: list[dict] = []
        self.step_index = 0
        self.step_frames: list[tk.Frame] = []
        draft = load_draft()
        launch_prefill = launch_prefill_from_args(sys.argv)
        self.launch_prefill_url = str(launch_prefill.get("launchUrl") or "")
        draft_profile = {} if launch_prefill.get("prefillCode") else draft

        self.api_url = tk.StringVar(value=normalize_api_url(launch_prefill.get("apiUrl") or draft.get("apiUrl") or DEFAULT_API_URL))
        self.access_token = tk.StringVar(value=draft_profile.get("accessToken") or "")
        self.first_name = tk.StringVar(value=draft_profile.get("firstName") or "")
        self.last_name = tk.StringVar(value=draft_profile.get("lastName") or "")
        self.email = tk.StringVar(value=draft_profile.get("email") or "")
        self.team = tk.StringVar(value=draft_profile.get("team") or "")
        self.establishment = tk.StringVar(value=draft_profile.get("establishment") or "")
        self.proposed_team = tk.StringVar(value=draft_profile.get("proposedTeam") or "")
        self.proposed_establishment = tk.StringVar(value=draft_profile.get("proposedEstablishment") or "")
        self.comment = tk.StringVar(value=draft_profile.get("comment") or "")
        self.include_mac = tk.BooleanVar(value=bool(draft.get("includeMac", True)))
        self.auto_update = tk.BooleanVar(value=bool(draft.get("autoUpdate", True)))
        self.language = tk.StringVar(value=draft.get("language") or "en")
        self.theme_preference_explicit = bool(draft.get("themePreferenceExplicit"))
        self.theme_preference = tk.StringVar(
            value=(draft.get("themePreference") if self.theme_preference_explicit else "system") or "system"
        )
        self.prefill_code = tk.StringVar(value=launch_prefill.get("prefillCode") or draft.get("prefillCode") or "")
        self.launch_prefill_requested = bool(launch_prefill.get("prefillCode"))
        self.connection_visible = tk.BooleanVar(value=bool(draft.get("connectionVisible", False)))
        self.profile_visible = tk.BooleanVar(value=bool(draft.get("profileVisible", False)))
        self.advanced_visible = tk.BooleanVar(value=bool(draft.get("advancedVisible", False)))
        self.last_loaded_prefill_file = str(draft.get("prefillFilePath") or "")
        self.last_loaded_prefill_mtime = float(draft.get("prefillFileMtime") or 0)
        self.scan_log = tk.StringVar(value="")
        self.raw_json_visible = False
        self.status = tk.StringVar(value=self.t("Ready."))
        self.connection_status = tk.StringVar(value=self.t("Not validated."))

        self.apply_theme_colors()
        self.register_macos_url_handler()
        self._build_ui()
        self._bind_draft_saves()
        self.after(300, self.load_organization_background)
        if self.launch_prefill_requested:
            self.status.set(self.t("Prefill link received. Loading profile..."))
            self.mark_newest_prefill_file_seen()
            self.after(450, self.check_update_then_load_prefill)
        else:
            self.after(700, self.auto_load_prefill_file)
        self.after(1200, self.start_prefill_file_watch)

    def register_macos_url_handler(self) -> None:
        if platform.system() != "Darwin":
            return
        try:
            self.tk.eval("namespace eval ::tk::mac {}")
        except tk.TclError:
            return

        def handle_open_event(*args) -> str:
            for value in args:
                text = str(value or "").strip()
                if text.startswith("spacefoot-collector://"):
                    self.after(0, lambda launch_url=text: self.apply_launch_prefill_url(launch_url))
            return ""

        for command in ("::tk::mac::OpenURL", "::tk::mac::OpenDocument"):
            try:
                self.tk.createcommand(command, handle_open_event)
            except tk.TclError:
                pass

    def apply_launch_prefill_url(self, launch_url: str) -> None:
        launch_url = str(launch_url or "").strip()
        if not launch_url or launch_url in self.handled_launch_urls:
            return
        launch_prefill = launch_prefill_from_args([sys.argv[0], launch_url])
        prefill_code = str(launch_prefill.get("prefillCode") or "").strip()
        if not prefill_code:
            return
        self.handled_launch_urls.add(launch_url)
        self.launch_prefill_url = str(launch_prefill.get("launchUrl") or launch_url)
        api_url = normalize_api_url(launch_prefill.get("apiUrl") or self.api_url.get() or DEFAULT_API_URL)
        self.api_url.set(api_url)
        self.prefill_code.set(prefill_code)
        self.launch_prefill_requested = True
        self.profile_visible.set(False)
        self.status.set(self.t("Prefill link received. Loading profile..."))
        self.mark_newest_prefill_file_seen()
        self.persist_draft()
        self.check_update_then_load_prefill()

    def t(self, text: str) -> str:
        return TRANSLATIONS.get(self.language.get(), {}).get(text, text)

    def _set_window_icon(self) -> None:
        try:
            icon_path = bundled_asset_path("assets/brand/app-icon.png")
            if icon_path.exists():
                photo = tk.PhotoImage(file=str(icon_path))
                self.app_icon_photo = photo
                self.iconphoto(True, photo)
                return
            photo = tk.PhotoImage(width=32, height=32)
            colors = [
                "#ff7e02", "#662e9b", "#ea3546",
                "#43bccd", "#f9c80e", "#ff7e02",
                "#662e9b", "#ea3546", "#43bccd",
            ]
            index = 0
            for y in (7, 13, 19):
                for x in (7, 13, 19):
                    photo.put(colors[index], to=(x, y, x + 5, y + 5))
                    index += 1
            self.app_icon_photo = photo
            self.iconphoto(True, photo)
        except tk.TclError:
            pass

    def brand_mark(self, parent, size=38):
        canvas = tk.Canvas(parent, width=size, height=size, bg=parent["bg"], highlightthickness=0, borderwidth=0)
        colors = [
            "#ff7e02", "#662e9b", "#ea3546",
            "#43bccd", "#f9c80e", "#ff7e02",
            "#662e9b", "#ea3546", "#43bccd",
        ]
        dot = max(5, size // 6)
        gap = max(3, size // 12)
        grid = dot * 3 + gap * 2
        start = (size - grid) // 2
        index = 0
        for row in range(3):
            for column in range(3):
                x = start + column * (dot + gap)
                y = start + row * (dot + gap)
                canvas.create_oval(x, y, x + dot, y + dot, fill=colors[index], outline="")
                index += 1
        return canvas

    def system_theme(self) -> str:
        if platform.system() == "Windows" and winreg:
            try:
                key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
                light = winreg.QueryValueEx(key, "AppsUseLightTheme")[0]
                return "light" if int(light) else "dark"
            except OSError:
                return "dark"
        return "dark"

    def active_theme(self) -> str:
        preference = self.theme_preference.get()
        return self.system_theme() if preference == "system" else preference

    def apply_theme_colors(self) -> None:
        global COLORS
        COLORS = (LIGHT_COLORS if self.active_theme() == "light" else DARK_COLORS).copy()
        self.apply_widget_styles()

    def apply_widget_styles(self) -> None:
        try:
            style = ttk.Style(self)
            if platform.system() == "Darwin":
                try:
                    style.theme_use("clam")
                except tk.TclError:
                    pass
            style.configure(
                "Spacefoot.TCombobox",
                fieldbackground=COLORS["input"],
                background=COLORS["panel_2"],
                foreground=COLORS["text"],
                arrowcolor=COLORS["text"],
                bordercolor=COLORS["line"],
                lightcolor=COLORS["line"],
                darkcolor=COLORS["line"],
                padding=4,
            )
            style.map(
                "Spacefoot.TCombobox",
                fieldbackground=[("readonly", COLORS["input"]), ("focus", COLORS["input"])],
                foreground=[("readonly", COLORS["text"]), ("focus", COLORS["text"])],
                background=[("readonly", COLORS["panel_2"]), ("active", COLORS["brand"])],
            )
            self.option_add("*TCombobox*Listbox.background", COLORS["input"])
            self.option_add("*TCombobox*Listbox.foreground", COLORS["text"])
            self.option_add("*TCombobox*Listbox.selectBackground", COLORS["brand"])
            self.option_add("*TCombobox*Listbox.selectForeground", COLORS["text"])
        except Exception:
            pass

    def apply_title_bar_theme(self) -> None:
        if platform.system() != "Windows":
            return
        try:
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id()) or self.winfo_id()
            value = ctypes.c_int(1 if self.active_theme() == "dark" else 0)
            for attribute in (20, 19):
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, attribute, ctypes.byref(value), ctypes.sizeof(value))
        except Exception:
            pass

    def _build_ui(self) -> None:
        self.apply_theme_colors()
        current_step = self.step_index
        for child in self.winfo_children():
            child.destroy()
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)
        shell = tk.Frame(self, bg=COLORS["bg"], padx=24, pady=20)
        shell.grid(row=0, column=0, sticky="nsew")
        shell.columnconfigure(0, weight=1)
        shell.rowconfigure(2, weight=1)

        header = tk.Frame(shell, bg=COLORS["bg"])
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)
        header.columnconfigure(1, weight=0)
        brand = tk.Frame(header, bg=COLORS["bg"])
        brand.grid(row=0, column=0, sticky="w")
        self.brand_mark(brand, 38).grid(row=0, column=0, rowspan=2, sticky="w", padx=(0, 10))
        tk.Label(brand, text="SPACEFOOT", fg=COLORS["brand_2"], bg=COLORS["bg"], font=("Segoe UI", 9, "bold")).grid(row=0, column=1, sticky="w")
        tk.Label(brand, text=self.t("IT Collector"), fg=COLORS["text"], bg=COLORS["bg"], font=("Segoe UI", 26, "bold")).grid(row=1, column=1, sticky="w")
        tk.Label(
            header,
            text=f"{self.t('Version')} {COLLECTOR_VERSION}",
            fg=COLORS["text"],
            bg=COLORS["panel_2"],
            padx=12,
            pady=7,
            font=("Segoe UI", 9, "bold"),
        ).grid(row=0, column=1, sticky="ne")
        tk.Label(
            header,
            text=self.t("This collector gathers only inventory information needed by the IT team."),
            fg=COLORS["muted"],
            bg=COLORS["bg"],
            font=("Segoe UI", 10),
        ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(8, 0))

        self.step_nav = tk.Frame(shell, bg=COLORS["bg"])
        self.step_nav.grid(row=1, column=0, sticky="ew", pady=(18, 0))
        for index, label in enumerate(["Profile", "Scan"]):
            chip = tk.Label(self.step_nav, text=f"{index + 1}. {self.t(label)}", padx=14, pady=8, font=("Segoe UI", 10, "bold"))
            chip.grid(row=0, column=index, sticky="w", padx=(0, 8))
            setattr(self, f"step_chip_{index}", chip)

        self.content_shell = tk.Frame(shell, bg=COLORS["bg"])
        self.content_shell.grid(row=2, column=0, sticky="nsew", pady=(14, 0))
        self.content_shell.columnconfigure(0, weight=1)
        self.content_shell.rowconfigure(0, weight=1)
        self.content_canvas = tk.Canvas(
            self.content_shell,
            bg=COLORS["bg"],
            highlightthickness=0,
            borderwidth=0,
            yscrollincrement=24,
        )
        self.content_scrollbar = tk.Scrollbar(self.content_shell, orient="vertical", command=self.content_canvas.yview)
        self.content_canvas.grid(row=0, column=0, sticky="nsew")
        self.content = tk.Frame(self.content_canvas, bg=COLORS["bg"])
        self.content.columnconfigure(0, weight=1)
        self.content_window = self.content_canvas.create_window((0, 0), window=self.content, anchor="nw")
        self.content.bind(
            "<Configure>",
            lambda event: self.sync_content_scroll(),
        )
        self.content_canvas.bind(
            "<Configure>",
            lambda event: self.resize_content_window(event),
        )
        self.content_canvas.bind_all("<MouseWheel>", self._on_mousewheel)

        self.step_frames = [
            self._profile_step(),
            self._scan_step(),
        ]
        footer = tk.Frame(shell, bg=COLORS["bg"])
        footer.grid(row=3, column=0, sticky="ew", pady=(14, 0))
        footer.columnconfigure(0, weight=1)
        tk.Label(
            footer,
            textvariable=self.status,
            fg=COLORS["muted"],
            bg=COLORS["bg"],
            font=("Segoe UI", 10),
            anchor="w",
            justify="left",
            wraplength=620,
        ).grid(row=0, column=0, sticky="ew", padx=(0, 12))
        self.language_button = self.button(footer, self.language_label(), self.toggle_language, secondary=True)
        self.language_button.grid(row=0, column=1, padx=(8, 8))
        self.theme_button = self.button(footer, self.theme_label(), self.toggle_theme, secondary=True)
        self.theme_button.grid(row=0, column=2, padx=(0, 8))
        action_bar = tk.Frame(footer, bg=COLORS["bg"])
        action_bar.grid(row=0, column=3, sticky="e")
        self.back_button = self.button(action_bar, self.t("Back"), self.previous_step, secondary=True)
        self.back_button.grid(row=0, column=0, padx=(0, 8))
        self.next_button = self.button(action_bar, self.t("Next"), self.primary_action)
        self.next_button.grid(row=0, column=1)
        if self.teams or self.establishments:
            self.after(0, self.update_org_controls)
        self.after(0, self.update_proposal_visibility)
        self.after(0, self.restore_dynamic_content)
        self.show_step(current_step)
        self.after(50, self.apply_title_bar_theme)

    def language_label(self) -> str:
        return "FR" if self.language.get() == "en" else "EN"

    def toggle_language(self) -> None:
        self.language.set("fr" if self.language.get() == "en" else "en")
        self.persist_draft()
        self._build_ui()

    def theme_label(self) -> str:
        labels = {
            "system": f"\u25c9 {self.t('System')}",
            "dark": f"\u25cf {self.t('Dark')}",
            "light": f"\u25cb {self.t('Light')}",
        }
        return f"{self.t('Theme')}: {labels.get(self.theme_preference.get(), self.theme_preference.get())}"

    def _on_mousewheel(self, event) -> None:
        if hasattr(self, "content_canvas"):
            bbox = self.content_canvas.bbox("all") or (0, 0, 0, 0)
            if (bbox[3] - bbox[1]) > self.content_canvas.winfo_height() + 2:
                self.content_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def resize_content_window(self, event) -> None:
        self.content_canvas.itemconfigure(self.content_window, width=event.width)
        self.sync_content_scroll()

    def sync_content_scroll(self) -> None:
        if not hasattr(self, "content_canvas") or not hasattr(self, "content_scrollbar"):
            return
        bbox = self.content_canvas.bbox("all") or (0, 0, 0, 0)
        canvas_height = self.content_canvas.winfo_height()
        content_height = bbox[3] - bbox[1]
        self.content_canvas.configure(scrollregion=(0, 0, max(bbox[2], self.content_canvas.winfo_width()), max(content_height, canvas_height)))
        if content_height > canvas_height + 2:
            self.content_canvas.configure(yscrollcommand=self.content_scrollbar.set)
            if not self.content_scrollbar.winfo_ismapped():
                self.content_scrollbar.grid(row=0, column=1, sticky="ns")
        else:
            self.content_canvas.configure(yscrollcommand=lambda *_: None)
            self.content_scrollbar.grid_remove()
            self.content_canvas.yview_moveto(0)

    def toggle_theme(self) -> None:
        order = ["system", "dark", "light"]
        current = self.theme_preference.get()
        self.theme_preference.set(order[(order.index(current) + 1) % len(order)] if current in order else "system")
        self.theme_preference_explicit = True
        self.persist_draft()
        self._build_ui()

    def restore_dynamic_content(self) -> None:
        if hasattr(self, "scan_log_output") and self.scan_log.get():
            self.scan_log_output.delete("1.0", tk.END)
            self.scan_log_output.insert(tk.END, self.scan_log.get())
            self.scan_log_output.see(tk.END)
        if self.payload and hasattr(self, "summary"):
            self.render_scan_summary()
        if hasattr(self, "raw_card") and self.raw_json_visible:
            self.raw_visible.set(True)
            self.raw_card.grid()
            self.raw_toggle.configure(text=self.t("Hide Advanced / Raw JSON"))

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
        combo = ttk.Combobox(parent, textvariable=variable, values=values, state="readonly", style="Spacefoot.TCombobox")
        return combo

    def button(self, parent, text, command, secondary=False):
        return ThemedButton(parent, text, command, secondary=secondary)

    def auto_update_checkbutton(self, parent):
        return tk.Checkbutton(
            parent,
            text=self.t("Update collector automatically before loading a prefilled profile"),
            variable=self.auto_update,
            bg=COLORS["panel"],
            fg=COLORS["text"],
            activebackground=COLORS["panel"],
            activeforeground=COLORS["text"],
            selectcolor=COLORS["input"],
        )

    def profile_missing_fields(self) -> list[str]:
        body = self.profile_body()
        required = [
            ("firstName", "First name"),
            ("lastName", "Last name"),
            ("email", "Email"),
        ]
        missing = [self.t(label) for key, label in required if not body.get(key)]
        if not body["team"] and not body["proposedTeam"]:
            missing.append(self.t("Team"))
        if not body["establishment"] and not body["proposedEstablishment"]:
            missing.append(self.t("Location"))
        return missing

    def profile_summary_text(self) -> str:
        name = " ".join(part for part in [self.first_name.get().strip(), self.last_name.get().strip()] if part)
        email = self.email.get().strip()
        team = self.team.get().strip() or self.proposed_team.get().strip()
        site = self.establishment.get().strip() or self.proposed_establishment.get().strip()
        parts = [part for part in [name, email, team, site] if part]
        return " · ".join(parts) if parts else self.t("Waiting for prefill")

    def profile_summary_parts(self) -> list[tuple[str, str]]:
        name = " ".join(part for part in [self.first_name.get().strip(), self.last_name.get().strip()] if part)
        return [
            (self.t("User"), name),
            (self.t("Email"), self.email.get().strip()),
            (self.t("Team"), self.team.get().strip() or self.proposed_team.get().strip()),
            (self.t("Location"), self.establishment.get().strip() or self.proposed_establishment.get().strip()),
        ]

    def toggle_profile_visible(self) -> None:
        self.profile_visible.set(not self.profile_visible.get())
        self.persist_draft()
        self._build_ui()

    def toggle_advanced_visible(self) -> None:
        self.advanced_visible.set(not self.advanced_visible.get())
        self.connection_visible.set(self.advanced_visible.get())
        self.persist_draft()
        self._build_ui()

    def _profile_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)

        missing = self.profile_missing_fields()
        profile_ready = not missing and bool(self.access_token.get().strip())

        hero = self.card(frame)
        hero.grid(row=0, column=0, sticky="ew")
        hero.columnconfigure(0, weight=1)
        state_text = self.t("Profile ready") if profile_ready else self.t("Missing profile information")
        self.label(hero, state_text, 18, bold=True).grid(row=0, column=0, sticky="w")
        self.label(hero, self.t("Check profile information before continuing."), 11, muted=True).grid(row=1, column=0, sticky="w", pady=(6, 10))
        summary = tk.Frame(hero, bg=COLORS["panel"])
        summary.grid(row=2, column=0, sticky="ew")
        summary.columnconfigure(0, weight=1)
        summary_parts = [(label, value) for label, value in self.profile_summary_parts() if value]
        if summary_parts:
            for index, (label, value) in enumerate(summary_parts):
                chip = tk.Frame(summary, bg=COLORS["panel_2"], padx=12, pady=8)
                chip.grid(row=index // 2, column=index % 2, sticky="ew", padx=(0, 8), pady=(0, 8))
                summary.columnconfigure(index % 2, weight=1)
                tk.Label(chip, text=label.upper(), fg=COLORS["muted"], bg=COLORS["panel_2"], font=("Segoe UI", 8, "bold")).grid(row=0, column=0, sticky="w")
                tk.Label(chip, text=value, fg=COLORS["text"], bg=COLORS["panel_2"], font=("Segoe UI", 10, "bold"), wraplength=430, justify="left").grid(row=1, column=0, sticky="w", pady=(3, 0))
        else:
            tk.Label(summary, text=self.t("Waiting for prefill"), fg=COLORS["muted"], bg=COLORS["panel"], font=("Segoe UI", 11, "bold")).grid(row=0, column=0, sticky="w")
        if missing:
            self.label(hero, f"{self.t('Please complete')}: {', '.join(missing)}", muted=True).grid(row=3, column=0, sticky="w", pady=(8, 0))
        action_row = tk.Frame(hero, bg=COLORS["panel"])
        action_row.grid(row=4, column=0, sticky="w", pady=(14, 0))
        profile_label = self.t("Hide profile") if self.profile_visible.get() else self.t("Edit profile")
        self.button(action_row, profile_label, self.toggle_profile_visible, secondary=True).grid(row=0, column=0, padx=(0, 8))
        advanced_label = self.t("Hide advanced options") if self.advanced_visible.get() else self.t("Advanced options")
        self.button(action_row, advanced_label, self.toggle_advanced_visible, secondary=True).grid(row=0, column=1)

        if self.profile_visible.get() or missing:
            profile_card = self.card(frame)
            profile_card.grid(row=1, column=0, sticky="ew", pady=(14, 0))
            profile_card.columnconfigure(1, weight=1)
            self.label(profile_card, self.t("User assignment"), 14, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
            fields = [
                ("First name", self.first_name),
                ("Last name", self.last_name),
                ("Email", self.email),
            ]
            for row, (label, variable) in enumerate(fields, start=1):
                self.label(profile_card, self.t(label), bold=True).grid(row=row, column=0, sticky="w", padx=(0, 12), pady=8)
                self.entry(profile_card, variable).grid(row=row, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Team"), bold=True).grid(row=4, column=0, sticky="w", padx=(0, 12), pady=8)
            self.team_combo = self.combo(profile_card, self.team, [])
            self.team_combo.grid(row=4, column=1, sticky="ew", pady=8)
            self.other_team_label = self.label(profile_card, self.t("Other team proposal"), bold=True)
            self.other_team_label.grid(row=5, column=0, sticky="w", padx=(0, 12), pady=8)
            self.other_team_entry = self.entry(profile_card, self.proposed_team)
            self.other_team_entry.grid(row=5, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Location"), bold=True).grid(row=6, column=0, sticky="w", padx=(0, 12), pady=8)
            self.establishment_combo = self.combo(profile_card, self.establishment, [])
            self.establishment_combo.grid(row=6, column=1, sticky="ew", pady=8)
            self.other_site_label = self.label(profile_card, self.t("Other location proposal"), bold=True)
            self.other_site_label.grid(row=7, column=0, sticky="w", padx=(0, 12), pady=8)
            self.other_site_entry = self.entry(profile_card, self.proposed_establishment)
            self.other_site_entry.grid(row=7, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Comment"), bold=True).grid(row=8, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(profile_card, self.comment).grid(row=8, column=1, sticky="ew", pady=8)

        if self.advanced_visible.get() or not self.access_token.get().strip():
            advanced = self.card(frame)
            advanced.grid(row=2, column=0, sticky="ew", pady=(14, 0))
            advanced.columnconfigure(1, weight=1)
            self.label(advanced, self.t("Advanced options"), 14, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
            self.label(advanced, self.t("Prefill code"), bold=True).grid(row=1, column=0, sticky="w", padx=(0, 12), pady=8)
            prefill_row = tk.Frame(advanced, bg=COLORS["panel"])
            prefill_row.grid(row=1, column=1, sticky="ew", pady=8)
            prefill_row.columnconfigure(0, weight=1)
            self.entry(prefill_row, self.prefill_code).grid(row=0, column=0, sticky="ew", padx=(0, 8))
            self.button(prefill_row, self.t("Load prefill"), self.load_prefill, secondary=True).grid(row=0, column=1)
            self.label(advanced, self.t("API URL"), bold=True).grid(row=2, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(advanced, self.api_url).grid(row=2, column=1, sticky="ew", pady=8)
            self.label(advanced, self.t("Collection access token"), bold=True).grid(row=3, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(advanced, self.access_token, show="*").grid(row=3, column=1, sticky="ew", pady=8)
            tk.Checkbutton(
                advanced,
                text=self.t("Include MAC address if authorized"),
                variable=self.include_mac,
                bg=COLORS["panel"],
                fg=COLORS["text"],
                activebackground=COLORS["panel"],
                activeforeground=COLORS["text"],
                selectcolor=COLORS["input"],
            ).grid(row=4, column=1, sticky="w", pady=(6, 12))
            self.auto_update_checkbutton(advanced).grid(row=5, column=1, sticky="w", pady=(0, 12))
            self.button(advanced, self.t("Validate token"), self.validate_token, secondary=True).grid(row=6, column=0, sticky="w", pady=(8, 0))
            tk.Label(advanced, textvariable=self.connection_status, fg=COLORS["brand_2"], bg=COLORS["panel"], font=("Segoe UI", 10, "bold")).grid(row=6, column=1, sticky="w", padx=(10, 0), pady=(8, 0))

        self.after(0, self.update_proposal_visibility)
        return frame

    def _express_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)

        missing = self.profile_missing_fields()
        profile_ready = not missing and bool(self.access_token.get().strip())

        hero = self.card(frame)
        hero.grid(row=0, column=0, sticky="ew")
        hero.columnconfigure(0, weight=1)
        state_text = self.t("Profile ready") if profile_ready else self.t("Missing profile information")
        self.label(hero, self.t("Ready to scan") if profile_ready else state_text, 18, bold=True).grid(row=0, column=0, sticky="w")
        self.label(hero, self.t("Review the information, scan this computer, then submit."), 11, muted=True).grid(row=1, column=0, sticky="w", pady=(6, 10))
        tk.Label(
            hero,
            text=self.profile_summary_text(),
            fg=COLORS["text"],
            bg=COLORS["panel"],
            wraplength=980,
            justify="left",
            font=("Segoe UI", 11, "bold"),
        ).grid(row=2, column=0, sticky="ew")
        if missing:
            self.label(hero, f"{self.t('Please complete')}: {', '.join(missing)}", muted=True).grid(row=3, column=0, sticky="w", pady=(8, 0))
        action_row = tk.Frame(hero, bg=COLORS["panel"])
        action_row.grid(row=4, column=0, sticky="w", pady=(14, 0))
        profile_label = self.t("Hide profile") if self.profile_visible.get() else self.t("Edit profile")
        self.button(action_row, profile_label, self.toggle_profile_visible, secondary=True).grid(row=0, column=0, padx=(0, 8))
        advanced_label = self.t("Hide advanced options") if self.advanced_visible.get() else self.t("Advanced options")
        self.button(action_row, advanced_label, self.toggle_advanced_visible, secondary=True).grid(row=0, column=1)

        if self.profile_visible.get() or missing:
            profile_card = self.card(frame)
            profile_card.grid(row=1, column=0, sticky="ew", pady=(14, 0))
            profile_card.columnconfigure(1, weight=1)
            self.label(profile_card, self.t("User assignment"), 14, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
            self.label(profile_card, self.t("Only missing information is shown. Advanced settings stay available for support."), muted=True).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 12))
            fields = [
                ("First name", self.first_name),
                ("Last name", self.last_name),
                ("Email", self.email),
            ]
            for row, (label, variable) in enumerate(fields, start=2):
                self.label(profile_card, self.t(label), bold=True).grid(row=row, column=0, sticky="w", padx=(0, 12), pady=8)
                self.entry(profile_card, variable).grid(row=row, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Team"), bold=True).grid(row=5, column=0, sticky="w", padx=(0, 12), pady=8)
            self.team_combo = self.combo(profile_card, self.team, [])
            self.team_combo.grid(row=5, column=1, sticky="ew", pady=8)
            self.other_team_label = self.label(profile_card, self.t("Other team proposal"), bold=True)
            self.other_team_label.grid(row=6, column=0, sticky="w", padx=(0, 12), pady=8)
            self.other_team_entry = self.entry(profile_card, self.proposed_team)
            self.other_team_entry.grid(row=6, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Location"), bold=True).grid(row=7, column=0, sticky="w", padx=(0, 12), pady=8)
            self.establishment_combo = self.combo(profile_card, self.establishment, [])
            self.establishment_combo.grid(row=7, column=1, sticky="ew", pady=8)
            self.other_site_label = self.label(profile_card, self.t("Other location proposal"), bold=True)
            self.other_site_label.grid(row=8, column=0, sticky="w", padx=(0, 12), pady=8)
            self.other_site_entry = self.entry(profile_card, self.proposed_establishment)
            self.other_site_entry.grid(row=8, column=1, sticky="ew", pady=8)
            self.label(profile_card, self.t("Comment"), bold=True).grid(row=9, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(profile_card, self.comment).grid(row=9, column=1, sticky="ew", pady=8)

        if self.advanced_visible.get():
            quick = self.card(frame)
            quick.grid(row=2, column=0, sticky="ew", pady=(14, 0))
            quick.columnconfigure(1, weight=1)
            self.label(quick, self.t("Advanced options"), 14, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
            self.label(quick, self.t("Prefill code"), bold=True).grid(row=1, column=0, sticky="w", padx=(0, 12), pady=8)
            prefill_row = tk.Frame(quick, bg=COLORS["panel"])
            prefill_row.grid(row=1, column=1, sticky="ew", pady=8)
            prefill_row.columnconfigure(0, weight=1)
            self.entry(prefill_row, self.prefill_code).grid(row=0, column=0, sticky="ew", padx=(0, 8))
            self.button(prefill_row, self.t("Load prefill"), self.load_prefill, secondary=True).grid(row=0, column=1)
            self.label(quick, self.t("API URL"), bold=True).grid(row=2, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(quick, self.api_url).grid(row=2, column=1, sticky="ew", pady=8)
            self.label(quick, self.t("Collection access token"), bold=True).grid(row=3, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(quick, self.access_token, show="*").grid(row=3, column=1, sticky="ew", pady=8)
            tk.Checkbutton(
                quick,
                text=self.t("Include MAC address if authorized"),
                variable=self.include_mac,
                bg=COLORS["panel"],
                fg=COLORS["text"],
                activebackground=COLORS["panel"],
                activeforeground=COLORS["text"],
                selectcolor=COLORS["input"],
            ).grid(row=4, column=1, sticky="w", pady=(6, 12))
            self.auto_update_checkbutton(quick).grid(row=5, column=1, sticky="w", pady=(0, 12))
            self.button(quick, self.t("Validate token"), self.validate_token, secondary=True).grid(row=6, column=0, sticky="w", pady=(8, 0))
            tk.Label(quick, textvariable=self.connection_status, fg=COLORS["brand_2"], bg=COLORS["panel"], font=("Segoe UI", 10, "bold")).grid(row=6, column=1, sticky="w", padx=(10, 0), pady=(8, 0))

        scan_card = self.card(frame)
        scan_card.grid(row=3, column=0, sticky="ew", pady=(14, 0))
        scan_card.columnconfigure(0, weight=1)
        self.label(scan_card, self.t("Hardware scan"), 16, bold=True).grid(row=0, column=0, sticky="w")
        self.label(scan_card, self.t("Scan this computer, then review the summary before submission."), muted=True).grid(row=1, column=0, sticky="w", pady=(4, 12))
        scan_text = self.t("Scan again") if self.payload else self.t("Scan this computer")
        self.scan_button = self.button(scan_card, scan_text, self.scan_computer)
        self.scan_button.grid(row=2, column=0, sticky="w")
        self.scan_log_output = scrolledtext.ScrolledText(scan_card, height=4, bg=COLORS["input"], fg=COLORS["text"], insertbackground=COLORS["text"], relief="flat")
        self.scan_log_output.grid(row=3, column=0, sticky="ew", pady=(12, 0))
        if self.scan_log.get():
            self.scan_log_output.insert(tk.END, self.scan_log.get())
            self.scan_log_output.see(tk.END)

        self.summary = tk.Frame(frame, bg=COLORS["bg"])
        self.summary.grid(row=4, column=0, sticky="nsew", pady=(14, 0))
        self.summary.columnconfigure(0, weight=1)

        submit_card = self.card(frame)
        submit_card.grid(row=5, column=0, sticky="ew", pady=(14, 0))
        self.label(submit_card, self.t("Review & submit"), 16, bold=True).grid(row=0, column=0, sticky="w")
        self.label(submit_card, self.t("Inventory ready to submit.") if self.payload else self.t("Scan this computer before submitting."), muted=True).grid(row=1, column=0, sticky="w", pady=(4, 12))
        self.submit_button = self.button(submit_card, self.t("Submit inventory"), self.submit_inventory)
        self.submit_button.grid(row=2, column=0, sticky="w")
        if not self.payload:
            self.submit_button.configure(state="disabled")

        self.raw_visible = tk.BooleanVar(value=self.raw_json_visible)
        self.raw_toggle = self.button(frame, self.t("Hide Advanced / Raw JSON") if self.raw_json_visible else self.t("Show Advanced / Raw JSON"), self.toggle_raw_json, secondary=True)
        self.raw_toggle.grid(row=6, column=0, sticky="w", pady=(14, 0))
        self.raw_card = self.card(frame)
        self.raw_card.grid(row=7, column=0, sticky="nsew", pady=(10, 0))
        if not self.raw_json_visible:
            self.raw_card.grid_remove()
        self.raw_card.columnconfigure(0, weight=1)
        self.raw_card.rowconfigure(1, weight=1)
        self.label(self.raw_card, self.t("Advanced / Raw JSON"), 14, bold=True).grid(row=0, column=0, sticky="w")
        self.raw_output = scrolledtext.ScrolledText(self.raw_card, height=14, bg=COLORS["input"], fg=COLORS["text"], insertbackground=COLORS["text"], relief="flat")
        self.raw_output.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        if self.payload:
            self.raw_output.insert(tk.END, json.dumps(self.payload, indent=2, ensure_ascii=False))
            self.after(0, self.render_scan_summary)
        self.after(0, self.update_proposal_visibility)
        return frame

    def _connection_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        intro = self.card(frame)
        intro.grid(row=0, column=0, sticky="ew")
        intro.columnconfigure(0, weight=1)
        self.label(intro, self.t("Collector purpose"), 17, bold=True).grid(row=0, column=0, sticky="w")
        self.label(intro, self.t("The IT team uses this tool to keep the fleet inventory accurate. Review everything before sending."), 11, muted=True).grid(row=1, column=0, sticky="w", pady=(6, 14))
        self.label(intro, self.t("Collected data"), 13, bold=True).grid(row=2, column=0, sticky="w")
        lines = [
            "Hostname, OS, manufacturer, model, serial/service tag",
            "CPU, RAM, storage, GPU if available",
            "Local IP, MAC if authorized, logged-in OS user",
            "No personal files are read.",
            "No browser history is read.",
            "No passwords are read.",
            "No remote control is installed.",
            "Data is submitted only after user confirmation.",
        ]
        for index, line in enumerate(lines, start=3):
            tk.Label(intro, text=f"- {self.t(line)}", fg=COLORS["muted"], bg=COLORS["panel"], font=("Segoe UI", 10)).grid(row=index, column=0, sticky="w", pady=2)

        quick = self.card(frame)
        quick.grid(row=1, column=0, sticky="ew", pady=(14, 0))
        quick.columnconfigure(1, weight=1)
        self.label(quick, self.t("Prefill code"), bold=True).grid(row=0, column=0, sticky="w", padx=(0, 12), pady=8)
        prefill_row = tk.Frame(quick, bg=COLORS["panel"])
        prefill_row.grid(row=0, column=1, sticky="ew", pady=8)
        prefill_row.columnconfigure(0, weight=1)
        self.entry(prefill_row, self.prefill_code).grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self.button(prefill_row, self.t("Load prefill"), self.load_prefill, secondary=True).grid(row=0, column=1)
        self.button(quick, self.t("Hide connection settings") if self.connection_visible.get() else self.t("Show connection settings"), self.toggle_connection_settings, secondary=True).grid(row=1, column=1, sticky="w", pady=(8, 0))

        self.connection_card = self.card(frame)
        self.connection_card.grid(row=2, column=0, sticky="ew", pady=(14, 0))
        self.connection_card.columnconfigure(1, weight=1)
        self.label(self.connection_card, self.t("Connection settings"), 14, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
        self.label(self.connection_card, self.t("Validate the API and collection access token before creating the scan token."), muted=True).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 16))
        self.label(self.connection_card, self.t("API URL"), bold=True).grid(row=2, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(self.connection_card, self.api_url).grid(row=2, column=1, sticky="ew", pady=8)
        self.label(self.connection_card, self.t("Collection access token"), bold=True).grid(row=3, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(self.connection_card, self.access_token, show="*").grid(row=3, column=1, sticky="ew", pady=8)
        self.label(self.connection_card, self.t("Use an admin-generated temporary token, not the collector token shown after web collection."), muted=True).grid(row=4, column=1, sticky="w")
        tk.Checkbutton(
            self.connection_card,
            text=self.t("Include MAC address if authorized"),
            variable=self.include_mac,
            bg=COLORS["panel"],
            fg=COLORS["text"],
            activebackground=COLORS["panel"],
            activeforeground=COLORS["text"],
            selectcolor=COLORS["input"],
        ).grid(row=5, column=1, sticky="w", pady=(6, 12))
        self.button(self.connection_card, self.t("Validate token"), self.validate_token, secondary=True).grid(row=6, column=0, sticky="w", pady=(8, 0))
        tk.Label(self.connection_card, textvariable=self.connection_status, fg=COLORS["brand_2"], bg=COLORS["panel"], font=("Segoe UI", 10, "bold")).grid(row=6, column=1, sticky="w", padx=(10, 0), pady=(8, 0))
        if not self.connection_visible.get():
            self.connection_card.grid_remove()
        return frame

    def toggle_connection_settings(self) -> None:
        self.connection_visible.set(not self.connection_visible.get())
        self.persist_draft()
        self._build_ui()

    def _privacy_card(self, parent):
        card = self.card(parent)
        self.label(card, self.t("Data transparency"), 14, bold=True).grid(row=0, column=0, sticky="w")
        lines = [
            "No personal files are read.",
            "No browser history is read.",
            "No passwords are read.",
            "No remote control is installed.",
            "Data is submitted only after user confirmation.",
        ]
        for index, line in enumerate(lines, start=1):
            tk.Label(card, text=f"- {self.t(line)}", fg=COLORS["muted"], bg=COLORS["panel"], font=("Segoe UI", 10)).grid(row=index, column=0, sticky="w", pady=2)
        return card

    def _assignment_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        card.columnconfigure(1, weight=1)
        self.label(card, self.t("User assignment"), 17, bold=True).grid(row=0, column=0, columnspan=2, sticky="w")
        self.label(card, self.t("Teams and locations are loaded from the admin-managed values."), muted=True).grid(row=1, column=0, columnspan=2, sticky="w", pady=(4, 16))
        fields = [
            ("First name", self.first_name),
            ("Last name", self.last_name),
            ("Email", self.email),
        ]
        for row, (label, variable) in enumerate(fields, start=2):
            self.label(card, self.t(label), bold=True).grid(row=row, column=0, sticky="w", padx=(0, 12), pady=8)
            self.entry(card, variable).grid(row=row, column=1, sticky="ew", pady=8)
        self.label(card, self.t("Team"), bold=True).grid(row=5, column=0, sticky="w", padx=(0, 12), pady=8)
        self.team_combo = self.combo(card, self.team, [])
        self.team_combo.grid(row=5, column=1, sticky="ew", pady=8)
        self.other_team_label = self.label(card, self.t("Other team proposal"), bold=True)
        self.other_team_label.grid(row=6, column=0, sticky="w", padx=(0, 12), pady=8)
        self.other_team_entry = self.entry(card, self.proposed_team)
        self.other_team_entry.grid(row=6, column=1, sticky="ew", pady=8)
        self.label(card, self.t("Location"), bold=True).grid(row=7, column=0, sticky="w", padx=(0, 12), pady=8)
        self.establishment_combo = self.combo(card, self.establishment, [])
        self.establishment_combo.grid(row=7, column=1, sticky="ew", pady=8)
        self.other_site_label = self.label(card, self.t("Other location proposal"), bold=True)
        self.other_site_label.grid(row=8, column=0, sticky="w", padx=(0, 12), pady=8)
        self.other_site_entry = self.entry(card, self.proposed_establishment)
        self.other_site_entry.grid(row=8, column=1, sticky="ew", pady=8)
        self.label(card, self.t("Comment"), bold=True).grid(row=9, column=0, sticky="w", padx=(0, 12), pady=8)
        self.entry(card, self.comment).grid(row=9, column=1, sticky="ew", pady=8)
        self.update_proposal_visibility()
        return frame

    def _scan_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        self.label(card, self.t("Hardware scan"), 17, bold=True).grid(row=0, column=0, sticky="w")
        scan_message = self.t("Inventory ready to submit.") if self.payload else self.t("Ready to scan")
        self.label(card, scan_message, muted=True).grid(row=1, column=0, sticky="w", pady=(4, 0))
        next_row = 1
        if self.submitted:
            success = self.card(frame)
            success.grid(row=next_row, column=0, sticky="ew", pady=(14, 0))
            success.columnconfigure(0, weight=1)
            self.label(success, self.t("Submission sent"), 17, bold=True).grid(row=0, column=0, sticky="w")
            self.label(success, self.t("The inventory was received by Spacefoot. You can close the collector."), muted=True).grid(row=1, column=0, sticky="w", pady=(4, 10))
            if self.submission_device_id:
                tk.Label(
                    success,
                    text=f"{self.t('Device ID')}: {self.submission_device_id}",
                    fg=COLORS["brand_2"],
                    bg=COLORS["panel"],
                    wraplength=980,
                    justify="left",
                    anchor="w",
                    font=("Segoe UI", 10, "bold"),
                ).grid(row=2, column=0, sticky="ew")
            next_row += 1
        log_card = self.card(frame)
        log_card.grid(row=next_row, column=0, sticky="ew", pady=(14, 0))
        log_card.columnconfigure(0, weight=1)
        self.label(log_card, self.t("Scan log"), 13, bold=True).grid(row=0, column=0, sticky="w")
        self.scan_log_output = scrolledtext.ScrolledText(log_card, height=5, bg=COLORS["input"], fg=COLORS["text"], insertbackground=COLORS["text"], relief="flat")
        self.scan_log_output.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        if self.scan_log.get():
            self.scan_log_output.insert(tk.END, self.scan_log.get())
            self.scan_log_output.see(tk.END)
        self.summary = tk.Frame(frame, bg=COLORS["bg"])
        self.summary.grid(row=next_row + 1, column=0, sticky="nsew", pady=(14, 0))
        self.summary.columnconfigure(0, weight=1)
        return frame

    def append_scan_log(self, message: str) -> None:
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        line = f"[{timestamp}] {message}\n"
        self.scan_log.set(f"{self.scan_log.get()}{line}")
        if hasattr(self, "scan_log_output"):
            self.scan_log_output.insert(tk.END, line)
            self.scan_log_output.see(tk.END)

    def _review_step(self):
        frame = tk.Frame(self.content, bg=COLORS["bg"])
        frame.grid(row=0, column=0, sticky="nsew")
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(1, weight=1)
        card = self.card(frame)
        card.grid(row=0, column=0, sticky="ew")
        self.label(card, self.t("Review & submit"), 17, bold=True).grid(row=0, column=0, sticky="w")
        self.label(card, self.t("Create the collection profile, then submit the reviewed scan."), muted=True).grid(row=1, column=0, sticky="w", pady=(4, 12))
        self.button(card, self.t("Submit inventory"), self.submit_inventory).grid(row=2, column=0, sticky="w")
        self.raw_visible = tk.BooleanVar(value=False)
        self.raw_toggle = self.button(frame, self.t("Show Advanced / Raw JSON"), self.toggle_raw_json, secondary=True)
        self.raw_toggle.grid(row=1, column=0, sticky="w", pady=(14, 0))
        self.raw_card = self.card(frame)
        self.raw_card.grid(row=2, column=0, sticky="nsew", pady=(10, 0))
        self.raw_card.grid_remove()
        self.raw_card.columnconfigure(0, weight=1)
        self.raw_card.rowconfigure(1, weight=1)
        self.label(self.raw_card, self.t("Advanced / Raw JSON"), 14, bold=True).grid(row=0, column=0, sticky="w")
        self.raw_output = scrolledtext.ScrolledText(self.raw_card, height=18, bg=COLORS["input"], fg=COLORS["text"], insertbackground=COLORS["text"], relief="flat")
        self.raw_output.grid(row=1, column=0, sticky="nsew", pady=(10, 0))
        if self.payload:
            self.raw_output.insert(tk.END, json.dumps(self.payload, indent=2, ensure_ascii=False))
        return frame

    def toggle_raw_json(self) -> None:
        visible = not self.raw_visible.get()
        self.raw_visible.set(visible)
        self.raw_json_visible = visible
        if visible:
            self.raw_card.grid()
            self.raw_toggle.configure(text=self.t("Hide Advanced / Raw JSON"))
        else:
            self.raw_card.grid_remove()
            self.raw_toggle.configure(text=self.t("Show Advanced / Raw JSON"))

    def _bind_draft_saves(self) -> None:
        variables = [
            self.api_url, self.access_token, self.first_name, self.last_name, self.email, self.team,
            self.establishment, self.proposed_team, self.proposed_establishment, self.comment, self.prefill_code,
        ]
        for variable in variables:
            variable.trace_add("write", lambda *_: self.persist_draft())
        self.include_mac.trace_add("write", lambda *_: self.persist_draft())
        self.auto_update.trace_add("write", lambda *_: self.persist_draft())
        self.team.trace_add("write", lambda *_: self.update_proposal_visibility())
        self.establishment.trace_add("write", lambda *_: self.update_proposal_visibility())

    def update_proposal_visibility(self) -> None:
        team_other = self.org_name_from_label(self.team.get().strip(), self.teams) == "Other"
        site_other = self.org_name_from_label(self.establishment.get().strip(), self.establishments) == "Other"
        for widget in (getattr(self, "other_team_label", None), getattr(self, "other_team_entry", None)):
            if not widget:
                continue
            widget.grid() if team_other else widget.grid_remove()
        for widget in (getattr(self, "other_site_label", None), getattr(self, "other_site_entry", None)):
            if not widget:
                continue
            widget.grid() if site_other else widget.grid_remove()

    def persist_draft(self) -> None:
        save_draft({
            "apiUrl": normalize_api_url(self.api_url.get()),
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
            "autoUpdate": self.auto_update.get(),
            "language": self.language.get(),
            "themePreference": self.theme_preference.get(),
            "themePreferenceExplicit": self.theme_preference_explicit,
            "prefillCode": self.prefill_code.get().strip(),
            "connectionVisible": self.connection_visible.get(),
            "profileVisible": self.profile_visible.get(),
            "advancedVisible": self.advanced_visible.get(),
            "prefillFilePath": self.last_loaded_prefill_file,
            "prefillFileMtime": self.last_loaded_prefill_mtime,
        })

    def load_prefill(self) -> None:
        if not self.prefill_code.get().strip():
            messagebox.showwarning(self.t("Prefill code"), self.t("Please enter the prefill code."))
            return
        self.status.set(self.t("Load prefill"))
        threading.Thread(target=self._load_prefill_background, daemon=True).start()

    def check_update_then_load_prefill(self) -> None:
        if not self.auto_update.get() or platform.system() not in {"Windows", "Linux"}:
            self.load_prefill()
            return
        self.status.set(self.t("Checking collector version..."))
        threading.Thread(target=self._check_update_then_load_prefill_background, daemon=True).start()

    def _check_update_then_load_prefill_background(self) -> None:
        try:
            manifest = fetch_json_url(COLLECTOR_RELEASES_URL, timeout=8)
            latest = str(manifest.get("latestVersion") or "")
            platform_key = "windows" if platform.system() == "Windows" else "linux"
            asset = (manifest.get("assets") or {}).get(platform_key) or {}
            download_url = str(asset.get("downloadUrl") or "")
            default_name = "spacefoot-it-collector-update.exe" if platform_key == "windows" else "spacefoot-it-collector-update.deb"
            file_name = str(asset.get("fileName") or default_name)
            if not latest or not download_url or not is_newer_version(latest, COLLECTOR_VERSION):
                self.after(0, self.load_prefill)
                return
            safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "-", file_name) or default_name
            installer_path = Path(tempfile.gettempdir()) / safe_name
            self.after(0, lambda: self.status.set(self.t("Downloading collector update...")))
            download_file(download_url, installer_path, timeout=120)
            if platform_key == "linux":
                self.after(0, lambda: self.install_linux_update_and_relaunch(installer_path, latest))
            else:
                self.after(0, lambda: self.install_update_and_relaunch(installer_path))
        except Exception:
            self.after(0, lambda: self.status.set(self.t("Update check failed. Loading current collector.")))
            self.after(700, self.load_prefill)

    def launch_url_for_reopen(self) -> str:
        if self.launch_prefill_url:
            return self.launch_prefill_url
        params = urllib.parse.urlencode({
            "prefillCode": self.prefill_code.get().strip(),
            "apiUrl": normalize_api_url(self.api_url.get()),
        })
        return f"spacefoot-collector://collect?{params}"

    def linux_update_command(self, installer_path: Path) -> str:
        return f"sudo apt install -y {shlex.quote(str(installer_path))}"

    def linux_executable(self, name: str) -> str:
        found = shutil.which(name)
        if found:
            return found
        for directory in ("/usr/local/bin", "/usr/bin", "/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"):
            candidate = Path(directory) / name
            if candidate.exists():
                return str(candidate)
        return ""

    def linux_process_env(self) -> dict:
        env = os.environ.copy()
        default_path = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"
        env["PATH"] = f"{env.get('PATH')}:{default_path}" if env.get("PATH") else default_path
        return env

    def launch_linux_update_terminal(self, installer_path: Path) -> bool:
        script_path = Path(tempfile.gettempdir()) / "spacefoot-it-collector-update.sh"
        script = "\n".join([
            "#!/bin/sh",
            "echo 'Installing Spacefoot IT Collector update...'",
            'sudo apt install -y "$1"',
            "status=$?",
            'if [ "$status" -ne 0 ]; then',
            "  echo",
            "  echo 'Update failed. Please keep this terminal open and copy the error for IT support.'",
            "  echo 'Command:'",
            '  echo "sudo apt install -y $1"',
            "  read -r _",
            '  exit "$status"',
            "fi",
            "echo",
            "echo 'Update installed. The collector will reopen automatically.'",
            "sleep 4",
            "",
        ])
        script_path.write_text(script, encoding="utf-8")
        script_path.chmod(0o755)
        shell_command = f"sh {shlex.quote(str(script_path))} {shlex.quote(str(installer_path))}"
        terminal_commands = [
            ["gnome-terminal", "--wait", "--", "bash", "-lc", shell_command],
            ["gnome-terminal", "--", "bash", "-lc", shell_command],
            ["ptyxis", "--wait", "--", "bash", "-lc", shell_command],
            ["kgx", "--wait", "--", "bash", "-lc", shell_command],
            ["x-terminal-emulator", "-e", "bash", "-lc", shell_command],
            ["konsole", "-e", "bash", "-lc", shell_command],
            ["xfce4-terminal", "-e", f"bash -lc {shlex.quote(shell_command)}"],
            ["mate-terminal", "--wait", "--", "bash", "-lc", shell_command],
            ["tilix", "-e", "bash", "-lc", shell_command],
            ["alacritty", "-e", "bash", "-lc", shell_command],
            ["kitty", "bash", "-lc", shell_command],
            ["xterm", "-e", "bash", "-lc", shell_command],
        ]
        env = self.linux_process_env()
        for command in terminal_commands:
            executable = self.linux_executable(command[0])
            if not executable:
                continue
            command = [executable, *command[1:]]
            try:
                process = subprocess.Popen(command, env=env)
                time.sleep(0.8)
                status = process.poll()
                if status is None or status == 0:
                    return True
            except Exception:
                continue
        return False

    def installed_linux_collector_version(self) -> str:
        try:
            result = subprocess.run(
                ["dpkg-query", "-W", "-f=${Version}", "spacefoot-it-collector"],
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            return result.stdout.strip() if result.returncode == 0 else ""
        except Exception:
            return ""

    def wait_for_linux_update_and_relaunch(self, expected_version: str, launch_url: str, deadline: float) -> None:
        installed = self.installed_linux_collector_version()
        if installed and is_newer_version(installed, COLLECTOR_VERSION) and not is_newer_version(expected_version, installed):
            executable = Path("/opt/spacefoot-it-collector/spacefoot-it-collector")
            try:
                xdg_open = self.linux_executable("xdg-open")
                subprocess.Popen([str(executable), launch_url] if executable.exists() else [xdg_open or "xdg-open", launch_url], env=self.linux_process_env())
            except Exception:
                pass
            self.destroy()
            return
        if time.time() < deadline:
            self.status.set(self.t("Waiting for Ubuntu to finish installing the update..."))
            self.after(2000, lambda: self.wait_for_linux_update_and_relaunch(expected_version, launch_url, deadline))
            return
        self.status.set(self.t("Update did not finish. Loading current collector."))
        self.after(1000, self.load_prefill)

    def install_linux_update_and_relaunch(self, installer_path: Path, latest_version: str) -> None:
        self.status.set(self.t("Installing update. The collector will reopen automatically."))
        launch_url = self.launch_url_for_reopen()
        messagebox.showinfo(
            self.t("Collector update ready"),
            self.t("A new collector version has been downloaded. Ubuntu will now ask for your password in a terminal to install the update. The collector will reopen automatically with the prefilled profile."),
        )
        try:
            if self.launch_linux_update_terminal(installer_path):
                self.status.set(self.t("Waiting for Ubuntu to finish installing the update..."))
                self.after(2000, lambda: self.wait_for_linux_update_and_relaunch(latest_version, launch_url, time.time() + 180))
                return
            command = self.linux_update_command(installer_path)
            messagebox.showwarning(
                self.t("Collector update ready"),
                f"{self.t('Unable to open a terminal for the update. Run this command, then reopen the collector from the web page:')}\n\n{command}",
            )
            self.after(1000, self.load_prefill)
        except Exception as exc:
            self.status.set(api_error_message(exc))
            self.after(1000, self.load_prefill)

    def install_update_and_relaunch(self, installer_path: Path) -> None:
        self.status.set(self.t("Installing update. The collector will reopen automatically."))
        messagebox.showinfo(
            self.t("Collector update ready"),
            self.t("A new collector version has been downloaded. Windows will now ask for permission to run the installer. Click Yes or Run. The collector will reopen automatically with the prefilled profile."),
        )
        prefill_code = self.prefill_code.get().strip()
        try:
            subprocess.Popen([
                str(installer_path),
                "/SP-",
                "/SILENT",
                "/NORESTART",
                "/CLOSEAPPLICATIONS",
                "/LaunchAfterInstall=1",
                f"/PrefillCode={prefill_code}",
            ])
            self.after(800, self.destroy)
        except Exception as exc:
            self.status.set(api_error_message(exc))
            self.after(1000, self.load_prefill)

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
        if not code:
            return
        already_loaded = str(path) == self.last_loaded_prefill_file and mtime <= self.last_loaded_prefill_mtime
        if already_loaded:
            return
        if data.get("apiUrl"):
            self.api_url.set(normalize_api_url(str(data.get("apiUrl"))))
        self.prefill_code.set(code)
        self.last_loaded_prefill_file = str(path)
        self.last_loaded_prefill_mtime = mtime
        self.status.set(self.t("Prefill file loaded automatically. You can edit before submitting."))
        self.persist_draft()
        self.load_prefill()

    def start_prefill_file_watch(self) -> None:
        if self.prefill_watch_active:
            return
        self.prefill_watch_active = True
        self.prefill_file_watch_tick()

    def prefill_file_watch_tick(self) -> None:
        self.auto_load_prefill_file()
        profile_complete = not self.profile_missing_fields() and bool(self.access_token.get().strip())
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
        self.status.set(self.t("Prefilled from the web page. You can edit before submitting."))
        self._build_ui()

    def show_step(self, index: int) -> None:
        self.step_index = max(0, min(index, len(self.step_frames) - 1))
        for frame in self.step_frames:
            frame.grid_remove()
        self.step_frames[self.step_index].grid()
        if hasattr(self, "content_canvas"):
            self.content_canvas.yview_moveto(0)
        for chip_index in range(len(self.step_frames)):
            chip = getattr(self, f"step_chip_{chip_index}", None)
            if not chip:
                continue
            active = chip_index == self.step_index
            chip.configure(bg=COLORS["brand"] if active else COLORS["panel"], fg=COLORS["text"] if active else COLORS["muted"])
        if hasattr(self, "back_button"):
            self.back_button.configure(state="normal" if self.step_index > 0 else "disabled")
        self.update_primary_action()

    def update_primary_action(self) -> None:
        if not hasattr(self, "next_button"):
            return
        if self.submitted:
            self.next_button.configure(text=self.t("Done"), state="normal")
            return
        if self.step_index == 0:
            self.next_button.configure(text=self.t("Next"), state="normal")
            return
        if self.payload:
            self.next_button.configure(text=self.t("Submit inventory"), state="normal")
        else:
            self.next_button.configure(text=self.t("Scan this computer"), state="normal")

    def primary_action(self) -> None:
        if self.submitted:
            self.destroy()
            return
        if self.step_index == 0:
            self.next_step()
            return
        if self.payload:
            self.submit_inventory()
        else:
            self.scan_computer()

    def next_step(self) -> None:
        if self.step_index == 0:
            missing = self.profile_missing_fields()
            if missing:
                self.profile_visible.set(True)
                self.persist_draft()
                self._build_ui()
                messagebox.showwarning(self.t("Missing fields"), f"{self.t('Please complete')}: {', '.join(missing)}")
                return
            if not self.api_url.get().strip():
                self.advanced_visible.set(True)
                self.persist_draft()
                self._build_ui()
                messagebox.showwarning(self.t("API URL required"), self.t("Please enter the API URL."))
                return
            if not self.access_token.get().strip():
                self.advanced_visible.set(True)
                self.persist_draft()
                self._build_ui()
                messagebox.showwarning(self.t("Token required"), self.t("Please enter the collection access token."))
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
        team_values = [self.org_label(item) for item in self.teams if item.get("name")] + [self.t("Other")]
        site_values = [self.org_label(item) for item in self.establishments if item.get("name")] + [self.t("Other")]
        if hasattr(self, "team_combo"):
            self.team_combo.configure(values=team_values)
        if hasattr(self, "establishment_combo"):
            self.establishment_combo.configure(values=site_values)
        self.normalize_selected_org_labels()
        self.status.set(f"{self.t('Loaded')} {len(self.teams)} {self.t('teams and')} {len(self.establishments)} {self.t('locations.')}")

    def normalize_selected_org_labels(self) -> None:
        for variable, items in ((self.team, self.teams), (self.establishment, self.establishments)):
            value = variable.get().strip()
            if not value:
                continue
            for item in items:
                if value == item.get("name") or value == self.org_label(item):
                    variable.set(self.org_label(item))
                    break

    def org_label(self, item: dict) -> str:
        name = item.get("name", "")
        abbreviation = item.get("abbreviation", "")
        if abbreviation and name.lower().startswith(f"{abbreviation.lower()} - "):
            return name
        return f"{abbreviation} - {name}" if abbreviation else name

    def org_name_from_label(self, value: str, items: list[dict]) -> str:
        if value in ("Other", self.t("Other")):
            return "Other"
        for item in items:
            if value == item.get("name") or value == self.org_label(item):
                return item.get("name", "")
        return value

    def validate_token(self) -> None:
        if not self.access_token.get().strip():
            messagebox.showwarning(self.t("Token required"), self.t("Please enter the collection access token."))
            return
        self.connection_status.set(self.t("Validating..."))
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
            self.after(0, lambda: self.connection_status.set(f"{self.t('Token valid')}: {label}"))
            self._load_organization()
        except Exception as exc:
            self.after(0, lambda: self.connection_status.set(self.friendly_token_error(exc)))

    def friendly_token_error(self, exc: Exception) -> str:
        message = api_error_message(exc)
        lowered = message.lower()
        if "token de collecte" in lowered or "collection" in lowered or "token" in lowered:
            return self.t("Invalid collection access token. Generate a temporary token in Admin > Collection tokens.")
        return message

    def scan_computer(self) -> None:
        if collector is None:
            messagebox.showerror(self.t("Collector unavailable"), f"{self.t('Unable to load collector')}: {COLLECTOR_IMPORT_ERROR}")
            return
        self.submitted = False
        self.status.set(self.t("Scanning hardware..."))
        if hasattr(self, "next_button"):
            self.next_button.configure(state="disabled", text=self.t("Scanning hardware..."))
        if hasattr(self, "scan_log_output"):
            self.scan_log_output.delete("1.0", tk.END)
        self.scan_log.set("")
        self.append_scan_log("Starting hardware inventory.")
        threading.Thread(target=self._scan_background, daemon=True).start()

    def _scan_background(self) -> None:
        try:
            self.after(0, lambda: self.append_scan_log("Collecting OS, hardware, storage, GPU and network fields."))
            payload = collector.collect(self.include_mac.get())
            payload["collectorVersion"] = COLLECTOR_VERSION
            payload["collectorPlatform"] = platform.system() or "Unknown"
            payload["collectorOs"] = platform.platform()
            payload["collectorBuildChannel"] = COLLECTOR_BUILD_CHANNEL
            self.payload = payload
            engine = payload.get("collectorEngine") or "unknown"
            engine_version = payload.get("osqueryVersion") or payload.get("collectorEngineVersion") or ""
            engine_label = f"{engine} {engine_version}".strip()
            self.after(0, lambda: self.append_scan_log(f"Collection engine: {engine_label}."))
            if engine == "python-fallback" and payload.get("collectorEngineMessage"):
                fallback_message = str(payload.get("collectorEngineMessage"))[:220]
                self.after(0, lambda: self.append_scan_log(f"Fallback reason: {fallback_message}"))
            self.after(0, lambda: self.append_scan_log("Scan completed. Review the summary below."))
            self.after(0, self.render_scan_summary)
            self.after(0, self.update_primary_action)
        except Exception as exc:
            self.after(0, lambda: self.append_scan_log(f"Scan failed: {exc}"))
            self.after(0, lambda: messagebox.showerror(self.t("Scan failed"), str(exc)))
            self.after(0, lambda: self.status.set(self.t("Scan failed")))
            self.after(0, self.update_primary_action)

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

    def gb_unit(self) -> str:
        return "Go" if self.language.get() == "fr" else "GB"

    def tb_unit(self) -> str:
        return "To" if self.language.get() == "fr" else "TB"

    def format_gb(self, value, digits=0) -> str:
        number = as_float(value)
        if number is None:
            return ""
        return f"{compact_number(number, digits)} {self.gb_unit()}"

    def marketed_storage_label(self, usable_gib) -> str:
        gib = as_float(usable_gib)
        if gib is None:
            return ""
        marketed_gb = gib * 1.073741824
        common_gb = [128, 256, 512, 1000, 2000, 4000, 8000]
        nearest = min(common_gb, key=lambda item: abs(item - marketed_gb))
        if abs(nearest - marketed_gb) / nearest > 0.16:
            return self.format_gb(gib)
        if nearest >= 1000:
            return f"{compact_number(nearest / 1000, 1)} {self.tb_unit()}"
        return f"{nearest} {self.gb_unit()}"

    def format_storage_summary(self, payload: dict) -> str:
        total = payload.get("storageTotalGb")
        free = payload.get("storageFreeGb")
        if total is None and free is None:
            return ""
        label = self.marketed_storage_label(total)
        usable = self.format_gb(total)
        free_text = self.format_gb(free)
        storage_type = str(payload.get("storageType") or "").strip()
        parts = [part for part in [label, storage_type] if part]
        if usable:
            parts.append(f"({usable} {self.t('usable')})")
        if free_text:
            parts.append(f"/ {free_text} {self.t('free')}")
        return " ".join(parts)

    def format_cpu_summary(self, payload: dict) -> str:
        cpu = str(payload.get("cpu") or "").strip()
        speed = as_float(payload.get("cpuMaxClockGhz") or payload.get("cpuCurrentClockGhz"))
        if cpu and speed and not re.search(r"\d+(\.\d+)?\s*GHz", cpu, re.I):
            return f"{cpu} ({speed:.2f} GHz)"
        return cpu

    def format_gpu_summary(self, payload: dict) -> str:
        gpu = str(payload.get("gpu") or "").strip()
        gpus = payload.get("gpus") if isinstance(payload.get("gpus"), list) else []
        if not gpu and gpus:
            gpu = " | ".join(str(item.get("name") or "").strip() for item in gpus if item.get("name"))
        return gpu

    def format_memory_details(self, payload: dict) -> str:
        modules = payload.get("memoryModules") if isinstance(payload.get("memoryModules"), list) else []
        populated = [item for item in modules if as_float(item.get("capacityGb"))]
        useful_modules = populated or modules
        types = sorted({str(item.get("memoryType") or item.get("type") or "").strip() for item in useful_modules if item.get("memoryType") or item.get("type")})
        speeds = sorted({int(speed) for item in useful_modules for speed in [as_float(item.get("configuredSpeedMhz") or item.get("speedMhz"))] if speed})
        capacities = [as_float(item.get("capacityGb")) for item in populated if as_float(item.get("capacityGb"))]
        parts = []
        if capacities and len(capacities) > 1:
            parts.append(" + ".join(self.format_gb(value) for value in capacities))
        if types:
            parts.append(" + ".join(types))
        if speeds:
            parts.append(f"{' / '.join(str(speed) for speed in speeds)} MHz")
        if populated and len(populated) > 1:
            parts.append(f"{len(populated)} modules")
        if parts:
            return " · ".join(parts)
        if payload.get("ramTotalGb"):
            return f"{self.format_gb(payload.get('ramTotalGb'), 1)} {self.t('installed')}"
        return ""

    def render_scan_summary(self) -> None:
        for child in self.summary.winfo_children():
            child.destroy()
        p = self.payload
        identity = p.get("hardwareIdentity") or {}
        memory_summary = self.format_memory_details(p)
        items = [
            (self.t("Collection engine"), " ".join(str(part) for part in [p.get("collectorEngine"), p.get("osqueryVersion") or p.get("collectorEngineVersion")] if part)),
            (self.t("OS"), f"{os_icon_name(p.get('osName'))}  {p.get('osName', '')} {p.get('osVersion', '')}".strip()),
            (self.t("Manufacturer"), p.get("manufacturer")),
            (self.t("Model"), p.get("model"), True),
            (self.t("Model number / SKU"), p.get("modelNumber") or identity.get("systemSku")),
            (self.t("Serial / Service tag"), p.get("serialNumber") or p.get("serviceTag") or identity.get("serviceTag")),
            (self.t("CPU"), self.format_cpu_summary(p)),
            (self.t("RAM"), self.format_gb(p.get("ramTotalGb"), 1) if p.get("ramTotalGb") else ""),
            (self.t("Memory details"), memory_summary),
            (self.t("Storage"), self.format_storage_summary(p)),
            (self.t("GPU"), self.format_gpu_summary(p)),
            (self.t("Network"), f"{self.t('IP')} {p.get('localIp') or '-'} / {self.t('MAC')} {p.get('macAddress') or '-'}"),
        ]
        for index, item in enumerate(items):
            title, value, *rest = item
            self.value_card(self.summary, index // 2, index % 2, title, value, bool(rest and rest[0]))
        missing = [title for title, value, *_ in items if not value or value == "-"]
        if missing:
            self.status.set(f"{self.t('Scan completed with unavailable fields')}: {', '.join(missing)}.")
        else:
            self.status.set(self.t("Scan completed."))
        if hasattr(self, "submit_button"):
            self.submit_button.configure(state="normal")
        if hasattr(self, "raw_output"):
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
            messagebox.showwarning(self.t("No scan"), self.t("Scan this computer before submitting."))
            return
        body = self.profile_body()
        missing = [field for field in ["firstName", "lastName", "email"] if not body[field]]
        if not body["team"] and not body["proposedTeam"]:
            missing.append(self.t("team or other team proposal"))
        if not body["establishment"] and not body["proposedEstablishment"]:
            missing.append(self.t("location or other location proposal"))
        if missing:
            self.profile_visible.set(True)
            self.persist_draft()
            self._build_ui()
            messagebox.showwarning(self.t("Missing fields"), f"{self.t('Please complete')}: {', '.join(missing)}")
            return
        self.submitted = False
        self.status.set(self.t("Creating collection profile..."))
        if hasattr(self, "next_button"):
            self.next_button.configure(state="disabled", text=self.t("Creating collection profile..."))
        threading.Thread(target=self._submit_background, daemon=True).start()

    def show_submission_success(self) -> None:
        self.status.set(self.t("Submission sent"))
        self.step_index = 1
        self._build_ui()
        if hasattr(self, "content_canvas"):
            self.content_canvas.yview_moveto(0)

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
                raise RuntimeError(self.t("API did not return a collection token."))
            request_body = json.dumps(self.payload).encode("utf-8")
            request = urllib.request.Request(
                f"{normalize_api_url(self.api_url.get()).rstrip('/')}/collect/scan",
                data=request_body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=25) as response:
                result = json.loads(response.read().decode("utf-8"))
            clear_sensitive_draft()
            self.submitted = True
            self.submission_device_id = str(result.get("deviceId") or "")
            self.after(0, self.show_submission_success)
        except Exception as exc:
            self.after(0, lambda: self.status.set(f"{self.t('Submission failed')}: {api_error_message(exc)}"))
            self.after(0, lambda: messagebox.showerror(self.t("Submission failed"), api_error_message(exc)))
            self.after(0, self.update_primary_action)


if __name__ == "__main__":
    CollectorApp().mainloop()
