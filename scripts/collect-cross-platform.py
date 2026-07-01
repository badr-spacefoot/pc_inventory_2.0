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
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_VERSION = "1.5.1"
OSQUERY_ENGINE_VERSION = "0.1.0"

PLACEHOLDER_VALUES = {
    "",
    "none",
    "null",
    "n/a",
    "na",
    "default string",
    "system serial number",
    "system product name",
    "system manufacturer",
    "to be filled by o.e.m.",
    "to be filled by oem",
    "not specified",
    "unknown",
    "-1",
}


def run(command, timeout=12):
    try:
        kwargs = {}
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            kwargs["startupinfo"] = startupinfo
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False, **kwargs)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def read_text(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="ignore").strip()
    except OSError:
        return ""


def clean_identifier(value):
    if isinstance(value, bytes):
        for encoding in ("utf-16-le", "utf-8"):
            try:
                value = value.decode(encoding, errors="ignore")
                break
            except ValueError:
                pass
    if isinstance(value, (list, tuple)):
        value = " ".join(str(item) for item in value if item)
    text = str(value or "").replace("\x00", " ").strip()
    if ";" in text and text.startswith("@"):
        text = text.split(";")[-1].strip()
    text = re.sub(r"\s+", " ", text).strip()
    return "" if text.lower() in PLACEHOLDER_VALUES else text


def first_clean(*values):
    for value in values:
        cleaned = clean_identifier(value)
        if cleaned:
            return cleaned
    return ""


def bytes_to_gb(value):
    try:
        return round(int(value) / (1024**3), 2)
    except (TypeError, ValueError):
        return None


def standard_capacity_gb(usable_gib, common=None, tolerance=0.18):
    gib = bytes_to_gb(usable_gib) if isinstance(usable_gib, str) and usable_gib.isdigit() else usable_gib
    try:
        marketed_gb = float(gib) * 1.073741824
    except (TypeError, ValueError):
        return None
    common_values = common or [2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
    nearest = min(common_values, key=lambda item: abs(item - marketed_gb))
    if nearest and abs(nearest - marketed_gb) / nearest <= tolerance:
        return nearest
    return round(float(gib), 2)


def normalized_memory_gb(usable_gib):
    return standard_capacity_gb(usable_gib, [2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 512], 0.20)


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return ""


def linux_physical_storage_summary():
    if not shutil.which("lsblk"):
        return {"storageTotalGb": None, "storageFreeGb": None, "storageType": ""}
    output = run(["lsblk", "-b", "-dn", "-o", "NAME,SIZE,TYPE,ROTA,MODEL"])
    total_bytes = 0
    rotational_values = []
    for line in output.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 4:
            continue
        name, size_text, device_type, rota = parts[:4]
        lowered_name = name.lower()
        if device_type != "disk" or lowered_name.startswith(("loop", "ram", "zram", "sr")):
            continue
        size = as_int(size_text)
        if not size or size <= 0:
            continue
        total_bytes += size
        rotational_values.append(str(rota).strip())
    free_gb = None
    try:
        free_gb = bytes_to_gb(shutil.disk_usage("/").free)
    except OSError:
        pass
    storage_type = ""
    if rotational_values:
        storage_type = "SSD" if all(value == "0" for value in rotational_values) else "HDD"
    return {
        "storageTotalGb": bytes_to_gb(total_bytes) if total_bytes else None,
        "storageFreeGb": free_gb,
        "storageType": storage_type,
    }


def linux_info():
    release = {}
    for line in read_text("/etc/os-release").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            release[key] = value.strip('"')
    memory_kb = re.search(r"MemTotal:\s+(\d+)", read_text("/proc/meminfo"))
    disk = shutil.disk_usage("/")
    physical_storage = linux_physical_storage_summary()
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
        "ramTotalGb": normalized_memory_gb(round(int(memory_kb.group(1)) / 1024 / 1024, 2)) if memory_kb else None,
        "storageTotalGb": physical_storage.get("storageTotalGb") or bytes_to_gb(disk.total),
        "storageFreeGb": physical_storage.get("storageFreeGb") or bytes_to_gb(disk.free),
        "storageType": physical_storage.get("storageType") or storage_type,
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


def windows_shell():
    candidates = [
        shutil.which("pwsh"),
        shutil.which("powershell"),
        shutil.which("powershell.exe"),
    ]
    system_root = os.environ.get("SystemRoot") or os.environ.get("WINDIR") or r"C:\Windows"
    candidates.extend(
        [
            str(Path(system_root) / "Sysnative" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
            str(Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
        ]
    )
    return next((candidate for candidate in candidates if candidate and Path(candidate).exists()), "")


def parse_json_object(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


def parse_json_array(raw):
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start:end + 1])
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
                return []
    return []


def find_osqueryi():
    configured = os.environ.get("SPACEFOOT_OSQUERYI")
    bundled_candidates = []
    if getattr(sys, "frozen", False):
        frozen_bundle_root = Path(getattr(sys, "_MEIPASS", "")) / "bundled-tools"
        executable_bundle_root = Path(sys.executable).resolve().parent / "bundled-tools"
        bundled_candidates.extend([
            frozen_bundle_root / "osquery" / "bin" / "osqueryi",
            frozen_bundle_root / "osquery" / "usr" / "bin" / "osqueryi",
            frozen_bundle_root / "osquery" / "opt" / "osquery" / "bin" / "osqueryi",
            frozen_bundle_root / "osqueryi",
            executable_bundle_root / "osquery" / "bin" / "osqueryi",
            executable_bundle_root / "osquery" / "usr" / "bin" / "osqueryi",
            executable_bundle_root / "osquery" / "opt" / "osquery" / "bin" / "osqueryi",
            executable_bundle_root / "osqueryi",
        ])
        for root in [frozen_bundle_root, executable_bundle_root]:
            if root.exists():
                bundled_candidates.extend(root.rglob("osqueryi"))
    else:
        repo_bundle_root = Path(__file__).resolve().parents[1] / "installer-assets" / "bundled-tools"
        bundled_candidates.extend([
            repo_bundle_root / "osquery" / "bin" / "osqueryi",
            repo_bundle_root / "osquery" / "usr" / "bin" / "osqueryi",
            repo_bundle_root / "osquery" / "opt" / "osquery" / "bin" / "osqueryi",
            repo_bundle_root / "osqueryi",
        ])
        if repo_bundle_root.exists():
            bundled_candidates.extend(repo_bundle_root.rglob("osqueryi"))
    candidates = [
        configured,
        *[str(path) for path in bundled_candidates],
        shutil.which("osqueryi"),
        shutil.which("osqueryi.exe"),
        r"C:\Program Files\osquery\osqueryi.exe",
        r"C:\Program Files (x86)\osquery\osqueryi.exe",
        "/usr/bin/osqueryi",
        "/usr/local/bin/osqueryi",
        "/opt/osquery/bin/osqueryi",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    return ""


def osquery_json(osqueryi, sql, timeout=12):
    raw = run([osqueryi, "--json", sql], timeout=timeout)
    return parse_json_array(raw)


def first_row(rows):
    return rows[0] if rows else {}


def as_int(value):
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return None


def osquery_storage_summary(mounts):
    totals = []
    frees = []
    for row in mounts:
        total_blocks = as_int(row.get("blocks") or row.get("blocks_count"))
        available_blocks = as_int(row.get("blocks_available") or row.get("blocks_free"))
        block_size = as_int(row.get("blocks_size") or row.get("block_size"))
        if total_blocks and block_size:
            totals.append(total_blocks * block_size)
        if available_blocks and block_size:
            frees.append(available_blocks * block_size)
    return {
        "storageTotalGb": bytes_to_gb(sum(totals)) if totals else None,
        "storageFreeGb": bytes_to_gb(sum(frees)) if frees else None,
    }


def fallback_logical_storage():
    if platform.system() == "Windows":
        drives = windows_logical_drives()
        total = sum(item["totalGb"] or 0 for item in drives) if drives else None
        free = sum(item["freeGb"] or 0 for item in drives) if drives else None
        return {
            "storage": {
                "storageTotalGb": round(total, 2) if total is not None else None,
                "storageFreeGb": round(free, 2) if free is not None else None,
            },
            "logicalDrives": drives,
        }

    try:
        disk = shutil.disk_usage(Path.home().anchor or "/")
        return {
            "storage": {
                "storageTotalGb": bytes_to_gb(disk.total),
                "storageFreeGb": bytes_to_gb(disk.free),
            },
            "logicalDrives": [],
        }
    except OSError:
        return {"storage": {"storageTotalGb": None, "storageFreeGb": None}, "logicalDrives": []}


def osquery_network(include_mac, interface_details, interface_addresses):
    ip = ""
    mac = ""
    for row in interface_addresses:
        address = clean_identifier(row.get("address"))
        if address and "." in address and not address.startswith("127."):
            ip = address
            interface = row.get("interface")
            if include_mac and interface:
                detail = next((item for item in interface_details if item.get("interface") == interface), {})
                mac = clean_identifier(detail.get("mac"))
            break
    if include_mac and not mac:
        for row in interface_details:
            value = clean_identifier(row.get("mac"))
            if value and value != "00:00:00:00:00:00":
                mac = value
                break
    return {"localIp": ip or local_ip(), "macAddress": mac if include_mac else ""}


def collect_with_osquery(include_mac):
    osqueryi = find_osqueryi()
    if not osqueryi:
        raise RuntimeError(
            "osquery is required for Spacefoot Inventory collection. "
            "Install osquery or use a Spacefoot installer that bundles it."
        )

    system_info = first_row(osquery_json(osqueryi, "select * from system_info limit 1;"))
    os_version = first_row(osquery_json(osqueryi, "select * from os_version limit 1;"))
    osquery_info = first_row(osquery_json(osqueryi, "select version from osquery_info limit 1;"))
    mounts = osquery_json(osqueryi, "select * from mounts;")
    interface_details = osquery_json(osqueryi, "select * from interface_details;")
    interface_addresses = osquery_json(osqueryi, "select * from interface_addresses;")
    logged_in_users = osquery_json(osqueryi, "select user,tty,host,time from logged_in_users;")
    memory_devices = osquery_json(osqueryi, "select * from memory_devices;")
    disk_info = osquery_json(osqueryi, "select * from disk_info;")

    if not system_info and not os_version:
        raise RuntimeError("osquery is installed but did not return system inventory data.")

    system = platform.system()
    storage = osquery_storage_summary(mounts)
    logical_drives = mounts
    linux_details = linux_info() if system == "Linux" else {}
    if system == "Linux":
        physical_storage = linux_physical_storage_summary()
        if physical_storage.get("storageTotalGb"):
            storage["storageTotalGb"] = physical_storage.get("storageTotalGb")
        if physical_storage.get("storageFreeGb"):
            storage["storageFreeGb"] = physical_storage.get("storageFreeGb")
    if storage.get("storageTotalGb") is None:
        fallback_storage = fallback_logical_storage()
        storage = fallback_storage["storage"]
        logical_drives = fallback_storage["logicalDrives"]
    network = osquery_network(include_mac, interface_details, interface_addresses)
    os_user = clean_identifier(first_row(logged_in_users).get("user")) or getpass.getuser()
    physical_memory = as_int(system_info.get("physical_memory") or system_info.get("memory_total"))
    ram_total_gb = bytes_to_gb(physical_memory)
    if ram_total_gb is not None:
        ram_total_gb = normalized_memory_gb(ram_total_gb)
    if ram_total_gb is None and system == "Windows":
        ram_total_gb = windows_memory_gb()
    manufacturer = first_clean(
        linux_details.get("manufacturer"),
        system_info.get("hardware_vendor"),
        system_info.get("vendor"),
        system_info.get("computer_name") if system != "Linux" else "",
    )
    model = first_clean(
        linux_details.get("model"),
        system_info.get("hardware_model"),
        system_info.get("hardware_version"),
        system_info.get("model"),
        platform.machine() if system != "Linux" else "",
    )
    serial = first_clean(
        linux_details.get("serialNumber"),
        system_info.get("hardware_serial"),
        system_info.get("serial_number"),
        system_info.get("uuid") if system != "Linux" else "",
    )
    storage_types = sorted(
        {
            clean_identifier(row.get("type") or row.get("model") or row.get("name"))
            for row in disk_info
            if clean_identifier(row.get("type") or row.get("model") or row.get("name"))
        }
    )
    memory_modules = [
        {
            "bankLabel": clean_identifier(row.get("bank_locator")),
            "slot": clean_identifier(row.get("device_locator")),
            "manufacturer": clean_identifier(row.get("manufacturer")),
            "partNumber": clean_identifier(row.get("part_number")),
            "serialNumber": clean_identifier(row.get("serial_number")),
            "capacityGb": bytes_to_gb(row.get("size")),
            "speedMhz": as_int(row.get("speed")),
            "memoryType": clean_identifier(row.get("memory_type") or row.get("type")),
        }
        for row in memory_devices
    ]
    hardware_identity = {
        "manufacturer": manufacturer,
        "model": model,
        "systemFamily": clean_identifier(system_info.get("hardware_family")),
        "systemSku": clean_identifier(system_info.get("hardware_sku")),
        "productName": model,
        "productNumber": clean_identifier(system_info.get("hardware_version")),
        "baseboardProduct": "",
        "baseboardManufacturer": manufacturer,
        "biosSerialNumber": serial,
        "chassisSerialNumber": "",
        "assetTag": "",
        "serviceTag": serial,
        "uuid": clean_identifier(system_info.get("uuid")),
    }
    return {
        "osName": first_clean(os_version.get("name"), "macOS" if system == "Darwin" else system or "Unknown"),
        "osVersion": first_clean(os_version.get("version"), os_version.get("major"), platform.platform()),
        "manufacturer": manufacturer,
        "model": model,
        "modelNumber": first_clean(hardware_identity.get("systemSku"), hardware_identity.get("productNumber")),
        "serialNumber": serial,
        "serviceTag": serial,
        "cpu": first_clean(system_info.get("cpu_brand"), platform.processor()),
        "gpu": first_clean(linux_details.get("gpu")) if system == "Linux" else "",
        "gpus": [{"name": first_clean(linux_details.get("gpu"))}] if system == "Linux" and first_clean(linux_details.get("gpu")) else [],
        "ramTotalGb": ram_total_gb,
        "memoryModules": memory_modules,
        **storage,
        "storageType": first_clean(linux_details.get("storageType"), " + ".join(storage_types[:4])),
        "logicalDrives": logical_drives,
        "physicalDisks": disk_info,
        "hardwareIdentity": hardware_identity,
        "osType": "macOS" if system == "Darwin" else system or "Unknown",
        "hostname": first_clean(system_info.get("hostname"), socket.gethostname()),
        **network,
        "osUser": os_user,
        "windowsUser": os_user,
        "collectorEngine": "osquery",
        "collectorEngineVersion": OSQUERY_ENGINE_VERSION,
        "collectorEnginePath": osqueryi,
        "osqueryVersion": clean_identifier(osquery_info.get("version")),
    }


def prefer_richer_value(current, candidate):
    current_clean = clean_identifier(current)
    candidate_clean = clean_identifier(candidate)
    if not candidate_clean:
        return current
    if not current_clean:
        return candidate
    if current_clean.lower() in {"x64", "amd64", "intel64"} and len(candidate_clean) > len(current_clean):
        return candidate
    if candidate_clean != current_clean and len(candidate_clean) > len(current_clean) + 8:
        return candidate
    return current


def merge_windows_details(details):
    if platform.system() != "Windows":
        return details
    windows = windows_info()
    merged = dict(details)
    hostname = clean_identifier(merged.get("hostname") or socket.gethostname()).lower()
    for key in (
        "manufacturer",
        "model",
        "modelNumber",
        "serialNumber",
        "serviceTag",
        "cpu",
        "gpu",
        "ramTotalGb",
        "storageType",
    ):
        if key == "manufacturer" and clean_identifier(merged.get(key)).lower() == hostname:
            merged[key] = windows.get(key) or merged.get(key)
        else:
            merged[key] = prefer_richer_value(merged.get(key), windows.get(key))
    for key in ("gpus", "memoryModules", "logicalDrives", "physicalDisks"):
        if windows.get(key):
            merged[key] = windows.get(key)
    for key in ("storageTotalGb", "storageFreeGb"):
        if windows.get(key) is not None:
            merged[key] = windows.get(key)
    if windows.get("hardwareIdentity"):
        identity = dict(merged.get("hardwareIdentity") or {})
        for key, value in windows["hardwareIdentity"].items():
            if key in ("manufacturer", "baseboardManufacturer") and clean_identifier(identity.get(key)).lower() == hostname:
                identity[key] = value or identity.get(key)
            else:
                identity[key] = prefer_richer_value(identity.get(key), value)
        merged["hardwareIdentity"] = identity
        merged["modelNumber"] = first_clean(
            merged.get("modelNumber"),
            identity.get("systemSku"),
            identity.get("productNumber"),
            identity.get("baseboardProduct"),
        )
    for key in ("cpuMaxClockGhz", "cpuCurrentClockGhz", "powershellCollector"):
        if windows.get(key) is not None:
            merged[key] = windows.get(key)
    if not merged.get("gpu") and merged.get("gpus"):
        merged["gpu"] = " | ".join(item.get("name", "") for item in merged["gpus"] if item.get("name"))
    return merged


def windows_registry_value(path, name):
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as key:
            value, _ = winreg.QueryValueEx(key, name)
            if isinstance(value, (list, tuple)):
                return "; ".join(str(item) for item in value if item)
            return str(value).strip() if value is not None else ""
    except (OSError, ImportError, ValueError):
        return ""


def windows_memory_gb():
    try:
        import ctypes

        class MemoryStatusEx(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatusEx()
        status.dwLength = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return bytes_to_gb(status.ullTotalPhys)
    except (AttributeError, OSError, ValueError):
        return None
    return None


def windows_logical_drives():
    drives = []
    try:
        import ctypes

        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for index in range(26):
            if not (bitmask & (1 << index)):
                continue
            root = f"{chr(65 + index)}:\\"
            drive_type = ctypes.windll.kernel32.GetDriveTypeW(root)
            if drive_type != 3:
                continue
            try:
                usage = shutil.disk_usage(root)
            except OSError:
                continue
            drives.append(
                {
                    "name": root,
                    "totalGb": bytes_to_gb(usage.total),
                    "freeGb": bytes_to_gb(usage.free),
                }
            )
    except (AttributeError, OSError, ValueError):
        pass
    return drives


def registry_subkeys(root, path):
    try:
        import winreg

        with winreg.OpenKey(root, path) as key:
            index = 0
            while True:
                try:
                    yield winreg.EnumKey(key, index)
                    index += 1
                except OSError:
                    break
    except (OSError, ImportError):
        return


def registry_values(root, path):
    values = {}
    try:
        import winreg

        with winreg.OpenKey(root, path) as key:
            index = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, index)
                    values[name] = value
                    index += 1
                except OSError:
                    break
    except (OSError, ImportError):
        pass
    return values


def clean_device_name(value):
    return clean_identifier(value)


def windows_registry_gpus():
    try:
        import winreg
    except ImportError:
        return []
    base = r"SYSTEM\CurrentControlSet\Enum\PCI"
    devices = []
    seen = set()
    for vendor_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, base):
        vendor_path = f"{base}\\{vendor_key}"
        for instance_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, vendor_path):
            values = registry_values(winreg.HKEY_LOCAL_MACHINE, f"{vendor_path}\\{instance_key}")
            hardware_ids = values.get("HardwareID", []) or []
            hardware_text = " ".join(str(item) for item in hardware_ids)
            description = clean_device_name(values.get("FriendlyName") or values.get("DeviceDesc"))
            looks_like_gpu = (
                str(values.get("Class", "")).lower() == "display"
                or re.search(r"CC_0300|CC_0302", hardware_text, re.I)
                or re.search(r"\b(nvidia|geforce|quadro|rtx|gtx|radeon|intel.*graphics|uhd graphics|iris|arc)\b", description, re.I)
            )
            if not looks_like_gpu:
                continue
            name = description
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            devices.append(
                {
                    "name": name,
                    "manufacturer": clean_device_name(values.get("Mfg")),
                    "hardwareId": clean_device_name("; ".join(values.get("HardwareID", []) or [])),
                }
            )
    video_base = r"SYSTEM\CurrentControlSet\Control\Video"
    for adapter_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, video_base):
        adapter_path = f"{video_base}\\{adapter_key}"
        for child_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, adapter_path):
            values = registry_values(winreg.HKEY_LOCAL_MACHINE, f"{adapter_path}\\{child_key}")
            name = clean_device_name(values.get("DriverDesc") or values.get("HardwareInformation.AdapterString"))
            if not name or name.lower() in seen:
                continue
            if not re.search(r"\b(nvidia|geforce|quadro|rtx|gtx|radeon|intel|uhd graphics|iris|arc)\b", name, re.I):
                continue
            seen.add(name.lower())
            devices.append(
                {
                    "name": name,
                    "manufacturer": clean_device_name(values.get("ProviderName")),
                    "hardwareId": "",
                }
            )
    return devices


def windows_registry_disks():
    try:
        import winreg
    except ImportError:
        return []
    roots = [
        (r"SYSTEM\CurrentControlSet\Enum\NVME", "NVMe"),
        (r"SYSTEM\CurrentControlSet\Enum\SCSI", "SCSI"),
        (r"SYSTEM\CurrentControlSet\Enum\IDE", "IDE"),
        (r"SYSTEM\CurrentControlSet\Enum\USBSTOR", "USB"),
    ]
    disks = []
    seen = set()
    def disk_dedupe_key(name):
        return re.sub(r"^(nvme|scsi|ide)\s+", "", name.lower()).strip()

    for base, bus_type in roots:
        for model_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, base):
            model_path = f"{base}\\{model_key}"
            for instance_key in registry_subkeys(winreg.HKEY_LOCAL_MACHINE, model_path):
                values = registry_values(winreg.HKEY_LOCAL_MACHINE, f"{model_path}\\{instance_key}")
                name = clean_device_name(values.get("FriendlyName") or values.get("DeviceDesc") or model_key.replace("&", " "))
                if not name:
                    continue
                dedupe_key = disk_dedupe_key(name)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                media_type = "SSD" if bus_type == "NVMe" or re.search(r"\b(ssd|nvme)\b", name, re.I) else ""
                disks.append(
                    {
                        "model": name,
                        "mediaType": media_type,
                        "busType": bus_type,
                        "sizeGb": None,
                        "serialNumber": clean_device_name(instance_key),
                    }
                )
    return disks


def windows_python_fallback():
    disk = shutil.disk_usage(Path.home().anchor)
    logical_drives = windows_logical_drives()
    storage_total = sum(item["totalGb"] or 0 for item in logical_drives) if logical_drives else bytes_to_gb(disk.total)
    storage_free = sum(item["freeGb"] or 0 for item in logical_drives) if logical_drives else bytes_to_gb(disk.free)
    bios_path = r"HARDWARE\DESCRIPTION\System\BIOS"
    cpu_path = r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
    cpu_mhz = as_int(windows_registry_value(cpu_path, "~MHz"))
    gpus = windows_registry_gpus()
    disks = windows_registry_disks()
    storage_types = []
    if any((item.get("mediaType") or "").upper() == "SSD" or (item.get("busType") or "").upper() == "NVME" for item in disks):
        storage_types.append("SSD")
    elif any((item.get("mediaType") or "").upper() == "HDD" for item in disks):
        storage_types.append("HDD")
    hardware_identity = {
        "manufacturer": windows_registry_value(bios_path, "SystemManufacturer"),
        "model": windows_registry_value(bios_path, "SystemProductName"),
        "systemFamily": windows_registry_value(bios_path, "SystemFamily"),
        "systemSku": windows_registry_value(bios_path, "SystemSKU"),
        "productName": windows_registry_value(bios_path, "BaseBoardProduct"),
        "productNumber": "",
        "baseboardProduct": windows_registry_value(bios_path, "BaseBoardProduct"),
        "baseboardManufacturer": windows_registry_value(bios_path, "BaseBoardManufacturer"),
        "biosSerialNumber": windows_registry_value(bios_path, "SystemSerialNumber") or windows_registry_value(bios_path, "SerialNumber"),
        "chassisSerialNumber": "",
        "assetTag": "",
        "serviceTag": windows_registry_value(bios_path, "SystemSerialNumber") or windows_registry_value(bios_path, "SerialNumber"),
        "uuid": "",
    }
    for key, value in list(hardware_identity.items()):
        hardware_identity[key] = clean_identifier(value)
    model_number = first_clean(hardware_identity.get("systemSku"), hardware_identity.get("productNumber"), hardware_identity.get("baseboardProduct"))
    serial_number = first_clean(hardware_identity.get("serviceTag"), hardware_identity.get("biosSerialNumber"), hardware_identity.get("chassisSerialNumber"))
    return {
        "osName": "Windows",
        "osVersion": platform.platform(),
        "manufacturer": hardware_identity.get("manufacturer"),
        "model": first_clean(hardware_identity.get("model"), hardware_identity.get("productName"), platform.machine()),
        "modelNumber": model_number,
        "serialNumber": serial_number,
        "serviceTag": hardware_identity.get("serviceTag"),
        "cpu": windows_registry_value(cpu_path, "ProcessorNameString") or platform.processor(),
        "cpuMaxClockGhz": round(cpu_mhz / 1000, 2) if cpu_mhz else None,
        "cpuCurrentClockGhz": round(cpu_mhz / 1000, 2) if cpu_mhz else None,
        "gpu": " | ".join(item["name"] for item in gpus),
        "gpus": gpus,
        "ramTotalGb": windows_memory_gb(),
        "storageTotalGb": round(storage_total, 2) if storage_total is not None else None,
        "storageFreeGb": round(storage_free, 2) if storage_free is not None else None,
        "storageType": " + ".join(storage_types),
        "logicalDrives": logical_drives,
        "physicalDisks": disks,
        "hardwareIdentity": hardware_identity,
        "powershellCollector": "registry-fallback",
    }


def windows_info():
    shell = windows_shell()
    if not shell:
        return windows_python_fallback()
    script = r"""
    $ErrorActionPreference = 'SilentlyContinue'
    $placeholderValues = @('', 'none', 'null', 'n/a', 'na', 'default string', 'system serial number', 'system product name', 'system manufacturer', 'to be filled by o.e.m.', 'to be filled by oem', 'not specified', 'unknown')
    function To-Gb($value) {
      if ($null -eq $value -or $value -eq '') { return $null }
      return [math]::Round([double]$value / 1GB, 2)
    }
    function Clean($value) {
      if ($null -eq $value) { return '' }
      $clean = ([string]$value).Trim()
      if ($placeholderValues -contains $clean.ToLowerInvariant()) { return '' }
      return $clean
    }
    function FirstClean($values) {
      foreach ($value in $values) {
        $clean = Clean $value
        if ($clean) { return $clean }
      }
      return ''
    }
    function RegistryValue($path, $name) {
      try {
        $value = (Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue).$name
        return Clean $value
      } catch {
        return ''
      }
    }

    $computer = Get-CimInstance Win32_ComputerSystem
    $computerProduct = Get-CimInstance Win32_ComputerSystemProduct
    $bios = Get-CimInstance Win32_BIOS
    $baseboard = Get-CimInstance Win32_BaseBoard
    $enclosure = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
    $msSystem = Get-CimInstance -Namespace root\wmi -ClassName MS_SystemInformation | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
    $registryBiosPath = 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS'
    $memoryTypeMap = @{
      20='DDR'; 21='DDR2'; 22='DDR2 FB-DIMM'; 24='DDR3'; 26='DDR4'; 27='LPDDR'; 28='LPDDR2'; 29='LPDDR3'; 30='LPDDR4'; 31='Logical non-volatile'; 34='DDR5'; 35='LPDDR5'
    }
    $memoryModules = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
      $type = $memoryTypeMap[[int]$_.SMBIOSMemoryType]
      if (-not $type) { $type = Clean $_.MemoryType }
      [pscustomobject]@{
        bankLabel = Clean $_.BankLabel
        slot = Clean $_.DeviceLocator
        manufacturer = Clean $_.Manufacturer
        partNumber = Clean $_.PartNumber
        serialNumber = Clean $_.SerialNumber
        capacityGb = To-Gb $_.Capacity
        speedMhz = if ($_.Speed) { [int]$_.Speed } else { $null }
        configuredSpeedMhz = if ($_.ConfiguredClockSpeed) { [int]$_.ConfiguredClockSpeed } else { $null }
        memoryType = Clean $type
        formFactor = Clean $_.FormFactor
      }
    })
    $videoControllers = @(Get-CimInstance Win32_VideoController |
      Where-Object { $_.Name -and $_.Name -notmatch 'Microsoft Basic|Remote Display|Indirect Display' })
    $logicalDisks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3')
    $diskDrives = @(Get-CimInstance Win32_DiskDrive)
    $physicalDisks = @(Get-PhysicalDisk)

    $gpus = @($videoControllers | ForEach-Object {
      [pscustomobject]@{
        name = Clean $_.Name
        adapterRamGb = To-Gb $_.AdapterRAM
        driverVersion = Clean $_.DriverVersion
      }
    })

    $disks = @()
    if ($physicalDisks.Count -gt 0) {
      $disks = @($physicalDisks | ForEach-Object {
        [pscustomobject]@{
          model = Clean $_.FriendlyName
          mediaType = Clean $_.MediaType
          busType = Clean $_.BusType
          sizeGb = To-Gb $_.Size
          serialNumber = Clean $_.SerialNumber
        }
      })
    } elseif ($diskDrives.Count -gt 0) {
      $disks = @($diskDrives | ForEach-Object {
        $type = if ($_.MediaType -match 'SSD|Solid') { 'SSD' } elseif ($_.Model -match 'NVMe|SSD') { 'SSD' } else { Clean $_.MediaType }
        [pscustomobject]@{
          model = Clean $_.Model
          mediaType = $type
          busType = Clean $_.InterfaceType
          sizeGb = To-Gb $_.Size
          serialNumber = Clean $_.SerialNumber
        }
      })
    }

    $storageTypes = @($disks | ForEach-Object {
      if ($_.mediaType -and $_.mediaType -ne 'Unspecified') { $_.mediaType }
      elseif ($_.busType) { $_.busType }
    } | Where-Object { $_ } | Select-Object -Unique)

    $logicalDrives = @($logicalDisks | ForEach-Object {
      [pscustomobject]@{
        name = Clean $_.DeviceID
        totalGb = To-Gb $_.Size
        freeGb = To-Gb $_.FreeSpace
      }
    })

    $hardwareIdentity = [pscustomobject]@{
      manufacturer = FirstClean @($computer.Manufacturer, $computerProduct.Vendor)
      model = FirstClean @($computer.Model, $computerProduct.Name)
      systemFamily = Clean $computer.SystemFamily
      systemSku = FirstClean @($computer.SystemSKUNumber, $msSystem.SystemSku)
      productName = Clean $computerProduct.Name
      productNumber = FirstClean @($computerProduct.Version, $computer.SystemSKUNumber)
      baseboardProduct = FirstClean @($baseboard.Product, $msSystem.BaseBoardProduct)
      baseboardManufacturer = Clean $baseboard.Manufacturer
      biosSerialNumber = FirstClean @($bios.SerialNumber, (RegistryValue $registryBiosPath 'SystemSerialNumber'), (RegistryValue $registryBiosPath 'SerialNumber'))
      chassisSerialNumber = Clean $enclosure.SerialNumber
      assetTag = Clean $enclosure.SMBIOSAssetTag
      serviceTag = FirstClean @($bios.SerialNumber, $computerProduct.IdentifyingNumber, $enclosure.SerialNumber, (RegistryValue $registryBiosPath 'SystemSerialNumber'), (RegistryValue $registryBiosPath 'SerialNumber'))
      uuid = Clean $computerProduct.UUID
    }
    $modelNumber = FirstClean @($hardwareIdentity.systemSku, $hardwareIdentity.productNumber, $hardwareIdentity.baseboardProduct)
    $serialNumber = FirstClean @($hardwareIdentity.serviceTag, $hardwareIdentity.biosSerialNumber, $computerProduct.IdentifyingNumber, $hardwareIdentity.chassisSerialNumber)

    [pscustomobject]@{
      osName='Windows'
      osVersion=(Clean (($os.Caption, $os.Version) -join ' '))
      manufacturer=$hardwareIdentity.manufacturer
      model=FirstClean @($hardwareIdentity.model, $hardwareIdentity.productName)
      modelNumber=$modelNumber
      serialNumber=$serialNumber
      serviceTag=$hardwareIdentity.serviceTag
      cpu=Clean $processor.Name
      cpuMaxClockGhz=if ($processor.MaxClockSpeed) { [math]::Round([double]$processor.MaxClockSpeed / 1000, 2) } else { $null }
      cpuCurrentClockGhz=if ($processor.CurrentClockSpeed) { [math]::Round([double]$processor.CurrentClockSpeed / 1000, 2) } else { $null }
      gpu=Clean (($gpus | ForEach-Object { $_.name }) -join ' | ')
      gpus=$gpus
      ramTotalGb=To-Gb $computer.TotalPhysicalMemory
      memoryModules=$memoryModules
      storageTotalGb=To-Gb (($logicalDisks | Measure-Object Size -Sum).Sum)
      storageFreeGb=To-Gb (($logicalDisks | Measure-Object FreeSpace -Sum).Sum)
      storageType=Clean ($storageTypes -join ' + ')
      logicalDrives=$logicalDrives
      physicalDisks=$disks
      hardwareIdentity=$hardwareIdentity
      powershellCollector='cim'
    } | ConvertTo-Json -Compress -Depth 6
    """
    raw = run([shell, "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], timeout=30)
    parsed = parse_json_object(raw)
    fallback = windows_python_fallback()
    if not parsed:
        return fallback
    has_core_data = any(parsed.get(key) for key in ("manufacturer", "model", "cpu", "gpu", "ramTotalGb"))
    if not has_core_data:
        return fallback
    for key, value in fallback.items():
        if key in ("hardwareIdentity",):
            identity = dict(parsed.get(key) or {})
            for identity_key, identity_value in value.items():
                identity[identity_key] = prefer_richer_value(identity.get(identity_key), identity_value)
            parsed[key] = identity
        elif key in ("gpus", "logicalDrives", "physicalDisks", "memoryModules"):
            if not parsed.get(key) and value:
                parsed[key] = value
        else:
            parsed[key] = prefer_richer_value(parsed.get(key), value)
    return parsed


def collect_without_osquery(include_mac, reason=""):
    system = platform.system()
    if system == "Windows":
        details = windows_info()
    elif system == "Darwin":
        details = macos_info()
    elif system == "Linux":
        details = linux_info()
    else:
        disk = shutil.disk_usage(Path.home())
        details = {
            "osName": system or "Unknown",
            "osVersion": platform.platform(),
            "manufacturer": "",
            "model": platform.machine() or "Unknown",
            "serialNumber": "",
            "cpu": platform.processor(),
            "gpu": "",
            "ramTotalGb": None,
            "storageTotalGb": bytes_to_gb(disk.total),
            "storageFreeGb": bytes_to_gb(disk.free),
            "storageType": "",
        }
    details = dict(details or {})
    details["collectorEngine"] = details.get("collectorEngine") or "python-fallback"
    details["collectorEngineVersion"] = details.get("collectorEngineVersion") or SCRIPT_VERSION
    if reason:
        details["collectorEngineMessage"] = str(reason)[:500]
    return details


def collect(include_mac):
    system = platform.system()
    try:
        details = merge_windows_details(collect_with_osquery(include_mac))
    except Exception as exc:
        details = collect_without_osquery(include_mac, exc)
    os_user = getpass.getuser()
    mac = ""
    if include_mac and not details.get("macAddress"):
        node = hex(__import__("uuid").getnode())[2:].zfill(12)
        mac = ":".join(node[index:index + 2] for index in range(0, 12, 2))
    return {
        **details,
        "osType": details.get("osType") or ("macOS" if system == "Darwin" else system or "Unknown"),
        "hostname": details.get("hostname") or socket.gethostname(),
        "macAddress": details.get("macAddress") or mac,
        "localIp": details.get("localIp") or local_ip(),
        "osUser": details.get("osUser") or os_user,
        "windowsUser": details.get("windowsUser") or os_user,
        "collectedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "scriptVersion": SCRIPT_VERSION,
        "collectorVersion": SCRIPT_VERSION,
        "collectorPlatform": system or "Unknown",
        "collectorOs": platform.platform(),
        "collectorBuildChannel": "script",
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
