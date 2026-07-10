"""Shared theme palette and Tk widgets for the collector."""

from __future__ import annotations

import tkinter as tk


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


def apply_palette(palette: dict[str, str]) -> None:
    COLORS.clear()
    COLORS.update(palette)


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
