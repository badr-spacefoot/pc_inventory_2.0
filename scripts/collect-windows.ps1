param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [Parameter(Mandatory = $true)]
  [string]$CollectionToken,

  [switch]$IncludeMacAddress
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "1.1.0"

function Get-FirstValue {
  param($Value, [string]$Fallback = "")
  if ($null -eq $Value) { return $Fallback }
  if ($Value -is [array]) {
    if ($Value.Count -eq 0) { return $Fallback }
    return $Value[0]
  }
  return $Value
}

function To-Gigabytes {
  param($Bytes)
  if (-not $Bytes) { return $null }
  return [math]::Round([double]$Bytes / 1GB, 2)
}

Write-Host "Collecte de l'inventaire IT Spacefoot..." -ForegroundColor Cyan

$computer = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$os = Get-CimInstance Win32_OperatingSystem
$processor = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController |
  Where-Object { $_.Name -and $_.Name -notmatch "Microsoft Basic" } |
  Select-Object -First 1
$drives = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$diskDrives = Get-CimInstance Win32_DiskDrive
$network = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | Select-Object -First 1

$storageTotal = ($drives | Measure-Object -Property Size -Sum).Sum
$storageFree = ($drives | Measure-Object -Property FreeSpace -Sum).Sum
$localIp = Get-FirstValue $network.IPAddress
$mac = if ($IncludeMacAddress) { $network.MACAddress } else { $null }
$physicalDisks = if (Get-Command Get-PhysicalDisk -ErrorAction SilentlyContinue) {
  Get-PhysicalDisk -ErrorAction SilentlyContinue
} else {
  @()
}
$mediaTypes = @($physicalDisks | ForEach-Object { $_.MediaType } | Where-Object { $_ -and $_ -ne "Unspecified" } | Select-Object -Unique)
$storageType = if ($mediaTypes.Count -gt 0) {
  $mediaTypes -join " + "
} elseif (($diskDrives.Model -join " ") -match "SSD|NVMe") {
  "SSD"
} elseif ($diskDrives.Count -gt 0) {
  "HDD"
} else {
  ""
}

$payload = @{
  hostname = $env:COMPUTERNAME
  osName = "Windows"
  osVersion = $os.Caption + " " + $os.Version
  manufacturer = $computer.Manufacturer
  model = $computer.Model
  serialNumber = $bios.SerialNumber
  cpu = $processor.Name
  gpu = $gpu.Name
  ramTotalGb = To-Gigabytes $computer.TotalPhysicalMemory
  storageTotalGb = To-Gigabytes $storageTotal
  storageFreeGb = To-Gigabytes $storageFree
  storageType = $storageType
  macAddress = $mac
  localIp = $localIp
  windowsUser = "$env:USERDOMAIN\$env:USERNAME"
  collectedAt = (Get-Date).ToUniversalTime().ToString("o")
  scriptVersion = $ScriptVersion
}

$json = $payload | ConvertTo-Json -Depth 6
$headers = @{
  "Authorization" = "Bearer $CollectionToken"
  "Content-Type" = "application/json"
}

try {
  $response = Invoke-RestMethod -Uri "$ApiUrl/collect/scan" -Method Post -Headers $headers -Body $json
  Write-Host "Inventaire envoye avec succes." -ForegroundColor Green
  Write-Host "Machine: $($response.deviceId)"
} catch {
  Write-Host "Echec de l'envoi de l'inventaire." -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}
