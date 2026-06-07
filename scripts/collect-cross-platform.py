#!/usr/bin/env python3
"""Cross-platform Spacefoot inventory collector using only the Python standard library."""

import argparse
import getpass
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_VERSION = "1.0.0"


def run(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=12, check=False)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="ignore").strip()
    except OSError:
        return ""


def bytes_to_gb(value):
    try:
        return round(int(value) / (1024**3), 2)
    except (TypeError, ValueError):
        return None


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return ""


def linux_info():
    release = {}
    for line in read_text("/etc/os-release").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            release[key] = value.strip('"')
    memory_kb = re.search(r"MemTotal:\s+(\d+)", read_text("/proc/meminfo"))
    disk = shutil.disk_usage("/")
    manufacturer = read_text("/sys/class/dmi/id/sys_vendor")
    model = read_text("/sys/class/dmi/id/product_name")
    serial = read_text("/sys/class/dmi/id/product_serial")
    if not serial and shutil.which("dmidecode") and hasattr(os, "geteuid") and os.geteuid() == 0:
        serial = run(["dmidecode", "-s", "system-serial-number"])
    cpu = ""
    for line in read_text("/proc/cpuinfo").splitlines():
        if line.lower().startswith("model name"):
            cpu = line.split(":", 1)[-1].strip()
            break
    storage_type = ""
    if shutil.which("lsblk"):
        rotational = run(["lsblk", "-dn", "-o", "ROTA"]).splitlines()
        if rotational:
            storage_type = "SSD" if all(value.strip() == "0" for value in rotational) else "HDD"
    return {
        "osName": release.get("NAME", "Linux"),
        "osVersion": release.get("PRETTY_NAME", platform.platform()),
        "manufacturer": manufacturer,
        "model": model or platform.machine(),
        "serialNumber": serial,
        "cpu": cpu or platform.processor(),
        "gpu": run(["sh", "-c", "lspci 2>/dev/null | grep -Ei 'vga|3d|display' | head -1"]),
        "ramTotalGb": round(int(memory_kb.group(1)) / 1024 / 1024, 2) if memory_kb else None,
        "storageTotalGb": bytes_to_gb(disk.total),
        "storageFreeGb": bytes_to_gb(disk.free),
        "storageType": storage_type,
    }


def macos_info():
    hardware_raw = run(["system_profiler", "SPHardwareDataType", "-json"])
    storage_raw = run(["system_profiler", "SPStorageDataType", "-json"])
    try:
        hardware = json.loads(hardware_raw).get("SPHardwareDataType", [{}])[0]
    except json.JSONDecodeError:
        hardware = {}
    try:
        storage = json.loads(storage_raw).get("SPStorageDataType", [])
    except json.JSONDecodeError:
        storage = []
    disk = shutil.disk_usage("/")
    chip = hardware.get("chip_type") or hardware.get("cpu_type") or run(["sysctl", "-n", "machdep.cpu.brand_string"])
    capacity = " ".join(str(item.get("physical_drive", "")) for item in storage).lower()
    return {
        "osName": "macOS",
        "osVersion": f"macOS {run(['sw_vers', '-productVersion'])}".strip(),
        "manufacturer": "Apple Inc.",
        "model": hardware.get("machine_name") or hardware.get("machine_model") or platform.machine(),
        "serialNumber": hardware.get("serial_number", ""),
        "cpu": chip,
        "gpu": run(["sh", "-c", "system_profiler SPDisplaysDataType | awk -F': ' '/Chipset Model/{print $2; exit}'"]),
        "ramTotalGb": bytes_to_gb(run(["sysctl", "-n", "hw.memsize"])),
        "storageTotalGb": bytes_to_gb(disk.total),
        "storageFreeGb": bytes_to_gb(disk.free),
        "storageType": "SSD" if "solid state" in capacity or "ssd" in capacity else "",
    }


def windows_info():
    script = r"""
    $c=Get-CimInstance Win32_ComputerSystem
    $b=Get-CimInstance Win32_BIOS
    $o=Get-CimInstance Win32_OperatingSystem
    $p=Get-CimInstance Win32_Processor|Select-Object -First 1
    $g=Get-CimInstance Win32_VideoController|Where-Object Name -notmatch 'Microsoft Basic'|Select-Object -First 1
    $d=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'
    [pscustomobject]@{
      osName='Windows';osVersion=($o.Caption+' '+$o.Version);manufacturer=$c.Manufacturer;model=$c.Model
      serialNumber=$b.SerialNumber;cpu=$p.Name;gpu=$g.Name;ramTotalGb=[math]::Round($c.TotalPhysicalMemory/1GB,2)
      storageTotalGb=[math]::Round(($d|Measure-Object Size -Sum).Sum/1GB,2)
      storageFreeGb=[math]::Round(($d|Measure-Object FreeSpace -Sum).Sum/1GB,2)
    }|ConvertTo-Json -Compress
    """
    raw = run(["powershell", "-NoProfile", "-Command", script])
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        disk = shutil.disk_usage(Path.home().anchor)
        return {
            "osName": "Windows",
            "osVersion": platform.platform(),
            "manufacturer": "",
            "model": platform.machine(),
            "serialNumber": "",
            "cpu": platform.processor(),
            "gpu": "",
            "ramTotalGb": None,
            "storageTotalGb": bytes_to_gb(disk.total),
            "storageFreeGb": bytes_to_gb(disk.free),
            "storageType": "",
        }


def collect(include_mac):
    system = platform.system()
    details = windows_info() if system == "Windows" else macos_info() if system == "Darwin" else linux_info()
    mac = ""
    if include_mac:
        node = hex(__import__("uuid").getnode())[2:].zfill(12)
        mac = ":".join(node[index:index + 2] for index in range(0, 12, 2))
    return {
        **details,
        "hostname": socket.gethostname(),
        "macAddress": mac,
        "localIp": local_ip(),
        "windowsUser": getpass.getuser(),
        "collectedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "scriptVersion": SCRIPT_VERSION,
    }


def main():
    parser = argparse.ArgumentParser(description="Collect and send Spacefoot hardware inventory.")
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--include-mac", action="store_true")
    args = parser.parse_args()
    payload = json.dumps(collect(args.include_mac)).encode("utf-8")
    request = urllib.request.Request(
        f"{args.api_url.rstrip('/')}/collect/scan",
        data=payload,
        headers={"Authorization": f"Bearer {args.token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
        print(f"Inventory sent successfully. Device: {result.get('deviceId', 'unknown')}")
    except urllib.error.HTTPError as error:
        print(f"Inventory upload failed: {error.read().decode('utf-8', errors='ignore')}")
        raise SystemExit(1)
    except urllib.error.URLError as error:
        print(f"Inventory upload failed: {error.reason}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
