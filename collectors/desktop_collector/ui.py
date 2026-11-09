"""Shared theme palette and Tk widgets for the collector."""

from __future__ import annotations

import tkinter as tk
from tkinter import font as tkfont


DARK_COLORS = {
    "bg": "#0f211c",
    "panel": "#142d27",
    "panel_2": "#213e32",
    "line": "#789184",
    "text": "#ffffff",
    "muted": "#bdcdc4",
    "brand": "#d6f279",
    "brand_2": "#d6f279",
    "brand_hover": "#e4faa0",
    "secondary_hover": "#2b493c",
    "on_brand": "#142d27",
    "danger": "#fda4af",
    "warning": "#e8c16a",
    "success": "#8bd9a9",
    "input": "#10251e",
}

LIGHT_COLORS = {
    "bg": "#f6f7f2",
    "panel": "#ffffff",
    "panel_2": "#eaf0e9",
    "line": "#789184",
    "text": "#142d27",
    "muted": "#53665d",
    "brand": "#0b6e58",
    "brand_2": "#085440",
    "brand_hover": "#085440",
    "secondary_hover": "#dde8de",
    "on_brand": "#ffffff",
    "danger": "#b42336",
    "warning": "#855000",
    "success": "#176b45",
    "input": "#ffffff",
}

COLORS = DARK_COLORS.copy()
FONT_UI = "Segoe UI"
FONT_MONO = "Consolas"


def configure_fonts(root) -> dict[str, str]:
    global FONT_UI, FONT_MONO
    families = {name.casefold(): name for name in tkfont.families(root)}
    def choose(candidates, named):
        return next((families[name.casefold()] for name in candidates if name.casefold() in families),
                    tkfont.nametofont(named, root=root).actual("family"))
    FONT_UI = choose(("Manrope", "Segoe UI", "Helvetica", "DejaVu Sans"), "TkDefaultFont")
    FONT_MONO = choose(("IBM Plex Mono", "Consolas", "Menlo", "DejaVu Sans Mono"), "TkFixedFont")
    for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont", "TkCaptionFont"):
        tkfont.nametofont(name, root=root).configure(family=FONT_UI)
    tkfont.nametofont("TkFixedFont", root=root).configure(family=FONT_MONO)
    return {"interface": FONT_UI, "technical": FONT_MONO}


def apply_palette(palette: dict[str, str]) -> None:
    COLORS.clear()
    COLORS.update(palette)


class ThemedButton(tk.Button):
    def __init__(self, parent, text, command, secondary=False):
        self.command = command
        self.secondary = secondary
        self._state = "normal"
        self.normal_bg = COLORS["panel_2"] if secondary else COLORS["brand"]
        self.hover_bg = COLORS["secondary_hover"] if secondary else COLORS["brand_hover"]
        self.disabled_bg = COLORS["panel"]
        self.normal_fg = COLORS["text"] if secondary else COLORS["on_brand"]
        self.disabled_fg = COLORS["muted"]
        super().__init__(
            parent,
            text=text,
            bg=self.normal_bg,
            fg=self.normal_fg,
            padx=16,
            pady=9,
            font=(FONT_UI, 10, "bold"),
            cursor="hand2",
            borderwidth=0,
            highlightthickness=2,
            highlightcolor=COLORS["brand_2"],
            takefocus=True,
            command=command,
        )
        self.bind("<Return>", self._click)
        self.bind("<Enter>", self._hover)
        self.bind("<Leave>", self._leave)

    def _click(self, _event=None):
        if self._state != "disabled" and self.command:
            return self.command()
        return None

    def _hover(self, _event=None) -> None:
        if self._state != "disabled":
            self._safe_configure(bg=self.hover_bg)

    def _leave(self, _event=None) -> None:
        self._sync_visual()

    def _sync_visual(self) -> None:
        if self._state == "disabled":
            self._safe_configure(bg=self.disabled_bg, fg=self.disabled_fg, cursor="")
        else:
            self._safe_configure(bg=self.normal_bg, fg=self.normal_fg, cursor="hand2")

    def _safe_configure(self, **options) -> None:
        try:
            if self.winfo_exists():
                tk.Button.configure(self, **options)
        except tk.TclError:
            return

    def configure(self, cnf=None, **kwargs):
        options = {}
        if cnf:
            options.update(cnf)
        options.update(kwargs)
        if "state" in options:
            self._state = str(options.pop("state") or "normal")
            self._safe_configure(state=self._state)
        if "command" in options:
            self.command = options.pop("command")
            self._safe_configure(command=self.command)
        if "text" in options:
            self._safe_configure(text=options.pop("text"))
        if options:
            self._safe_configure(**options)
        self._sync_visual()

    config = configure

    def cget(self, key):
        if key == "state":
            return self._state
        return tk.Button.cget(self, key)
