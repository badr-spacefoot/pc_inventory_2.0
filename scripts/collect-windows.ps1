param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [Parameter(Mandatory = $true)]
  [string]$CollectionToken,

  [switch]$IncludeMacAddress
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "1.0.0"

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
$drives = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$network = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" | Select-Object -First 1

$storageTotal = ($drives | Measure-Object -Property Size -Sum).Sum
$storageFree = ($drives | Measure-Object -Property FreeSpace -Sum).Sum
$localIp = Get-FirstValue $network.IPAddress
$mac = if ($IncludeMacAddress) { $network.MACAddress } else { $null }

$payload = @{
  hostname = $env:COMPUTERNAME
  osName = "Windows"
  osVersion = $os.Caption + " " + $os.Version
  manufacturer = $computer.Manufacturer
  model = $computer.Model
  serialNumber = $bios.SerialNumber
  cpu = $processor.Name
  ramTotalGb = To-Gigabytes $computer.TotalPhysicalMemory
  storageTotalGb = To-Gigabytes $storageTotal
  storageFreeGb = To-Gigabytes $storageFree
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
