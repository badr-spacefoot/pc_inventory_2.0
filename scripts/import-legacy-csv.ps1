param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,

  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [Parameter(Mandatory = $true)]
  [string]$CollectionAccessToken,

  [string]$DefaultEmailDomain = "legacy.local",

  [string]$DefaultService = "Non renseigne"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
  throw "CSV introuvable: $CsvPath"
}

$rows = Import-Csv -LiteralPath $CsvPath -Encoding UTF8
$headers = @{
  "X-Collection-Access-Token" = $CollectionAccessToken
  "Content-Type" = "application/json"
}

$count = 0
$failed = 0

foreach ($row in $rows) {
  $firstName = ($row."Prénom" | ForEach-Object { "$_".Trim() })
  $lastName = ($row."Nom" | ForEach-Object { "$_".Trim() })
  $emailLocal = (($firstName + "." + $lastName).ToLowerInvariant() -replace "[^a-z0-9._-]", "")

  $payload = @{
    timestamp = $row."Timestamp"
    firstName = $firstName
    lastName = $lastName
    email = "$emailLocal@$DefaultEmailDomain"
    team = $row."Team"
    site = $row."Établissement"
    service = $DefaultService
    osType = $row."OS Type"
    pcName = $row."Nom de la machine"
    user = $row."Utilisateur OS"
    manufacturer = $row."Fabricant"
    model = $row."Modèle"
    serial = $row."Numéro de série"
    os = $row."Système d’exploitation"
    cpu = $row."CPU"
    ram = $row."RAM"
    ip = $row."IP"
    mac = $row."MAC"
    notes = $row."Notes"
  }

  try {
    Invoke-RestMethod -Uri "$ApiUrl/collect/legacy-scan" -Method Post -Headers $headers -Body ($payload | ConvertTo-Json -Depth 6) | Out-Null
    $count++
    Write-Host "Import OK: $($payload.pcName) / $($payload.serial)" -ForegroundColor Green
  } catch {
    $failed++
    Write-Host "Import KO: $($payload.pcName) / $($payload.serial)" -ForegroundColor Red
    Write-Host $_.Exception.Message
  }
}

Write-Host "Import termine. Succes: $count. Echecs: $failed."
if ($failed -gt 0) {
  exit 1
}
