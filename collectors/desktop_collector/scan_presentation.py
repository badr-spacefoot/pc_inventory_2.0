"""Formatting and rendering for the collector scan summary."""

from __future__ import annotations

import json
import re
import tkinter as tk

try:
    from .support import as_float, compact_number, money_text, os_icon_name
    from .ui import COLORS
except ImportError:  # Supports direct execution and PyInstaller entry points.
    from support import as_float, compact_number, money_text, os_icon_name
    from ui import COLORS


class ScanPresentationMixin:
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
        types = sorted(
            {
                str(item.get("memoryType") or item.get("type") or "").strip()
                for item in useful_modules
                if item.get("memoryType") or item.get("type")
            }
        )
        speeds = sorted(
            {
                int(speed)
                for item in useful_modules
                for speed in [as_float(item.get("configuredSpeedMhz") or item.get("speedMhz"))]
                if speed
            }
        )
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
        payload = self.payload
        identity = payload.get("hardwareIdentity") or {}
        memory_summary = self.format_memory_details(payload)
        items = [
            (
                self.t("Collection engine"),
                " ".join(
                    str(part)
                    for part in [
                        payload.get("collectorEngine"),
                        payload.get("osqueryVersion") or payload.get("collectorEngineVersion"),
                    ]
                    if part
                ),
            ),
            (
                self.t("OS"),
                f"{os_icon_name(payload.get('osName'))}  {payload.get('osName', '')} {payload.get('osVersion', '')}".strip(),
            ),
            (self.t("Manufacturer"), payload.get("manufacturer")),
            (self.t("Model"), payload.get("model"), True),
            (self.t("Model number / SKU"), payload.get("modelNumber") or identity.get("systemSku")),
            (
                self.t("Serial / Service tag"),
                payload.get("serialNumber") or payload.get("serviceTag") or identity.get("serviceTag"),
            ),
            (self.t("CPU"), self.format_cpu_summary(payload)),
            (
                self.t("RAM"),
                self.format_gb(payload.get("ramTotalGb"), 1) if payload.get("ramTotalGb") else "",
            ),
            (self.t("Memory details"), memory_summary),
            (self.t("Storage"), self.format_storage_summary(payload)),
            (self.t("GPU"), self.format_gpu_summary(payload)),
            (
                self.t("Network"),
                f"{self.t('IP')} {payload.get('localIp') or '-'} / {self.t('MAC')} {payload.get('macAddress') or '-'}",
            ),
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
