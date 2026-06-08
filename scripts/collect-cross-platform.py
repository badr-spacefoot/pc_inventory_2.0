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

SCRIPT_VERSION = "1.5.0"

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
    gpus = windows_registry_gpus()
    disks = windows_registry_disks()
    storage_types = []
    for item in disks:
        value = item.get("mediaType") or item.get("busType") or ""
        if value and value not in storage_types:
            storage_types.append(value)
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
    if parsed:
        return parsed
    else:
        return windows_python_fallback()


def collect(include_mac):
    system = platform.system()
    details = windows_info() if system == "Windows" else macos_info() if system == "Darwin" else linux_info()
    os_user = getpass.getuser()
    mac = ""
    if include_mac:
        node = hex(__import__("uuid").getnode())[2:].zfill(12)
        mac = ":".join(node[index:index + 2] for index in range(0, 12, 2))
    return {
        **details,
        "osType": "macOS" if system == "Darwin" else system or "Unknown",
        "hostname": socket.gethostname(),
        "macAddress": mac,
        "localIp": local_ip(),
        "osUser": os_user,
        "windowsUser": os_user,
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
