param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,

  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [string]$CollectionAccessToken,

  [string]$DefaultEmailDomain = "legacy.local",

  [string]$DefaultService = "Non renseigne"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
  throw "CSV introuvable: $CsvPath"
}

if ([string]::IsNullOrWhiteSpace($CollectionAccessToken)) {
  $secureToken = Read-Host "COLLECTION_ACCESS_TOKEN" -AsSecureString
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $CollectionAccessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  } finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
  }
}

$rows = Import-Csv -LiteralPath $CsvPath -Encoding UTF8
$headers = @{
  "X-Collection-Access-Token" = $CollectionAccessToken
  "Content-Type" = "application/json"
}

$count = 0
$failed = 0

foreach ($row in $rows) {
  # Read by column position so Windows PowerShell encoding does not corrupt accented headers.
  $values = @($row.PSObject.Properties | ForEach-Object { "$($_.Value)".Trim() })
  if ($values.Count -lt 16) {
    $failed++
    Write-Host "Import KO: ligne CSV incomplete" -ForegroundColor Red
    continue
  }

  $timestamp = $values[0]
  $firstName = $values[1]
  $lastName = $values[2]
  $emailLocal = (($firstName + "." + $lastName).ToLowerInvariant() -replace "[^a-z0-9._-]", "")

  $collectedAt = $timestamp
  $parsedDate = [datetime]::MinValue
  if ([datetime]::TryParseExact(
    $timestamp,
    "dd/MM/yyyy HH:mm:ss",
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeLocal,
    [ref]$parsedDate
  )) {
    $collectedAt = $parsedDate.ToUniversalTime().ToString("o")
  }

  $payload = @{
    timestamp = $collectedAt
    firstName = $firstName
    lastName = $lastName
    email = "$emailLocal@$DefaultEmailDomain"
    team = $values[3]
    site = $values[4]
    service = $DefaultService
    osType = $values[5]
    pcName = $values[6]
    user = $values[7]
    manufacturer = $values[8]
    model = $values[9]
    serial = $values[10]
    os = $values[11]
    cpu = $values[12]
    ram = $values[13]
    ip = $values[14]
    mac = $values[15]
    notes = if ($values.Count -gt 16) { $values[16] } else { "" }
  }

  try {
    Invoke-RestMethod -Uri "$ApiUrl/collect/legacy-scan" -Method Post -Headers $headers -Body ($payload | ConvertTo-Json -Depth 6) | Out-Null
    $count++
    Write-Host "Import OK: $($payload.pcName) / $($payload.serial)" -ForegroundColor Green
  } catch {
    $failed++
    Write-Host "Import KO: $($payload.pcName) / $($payload.serial)" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
      Write-Host $_.ErrorDetails.Message
    }
  }
}

Write-Host "Import termine. Succes: $count. Echecs: $failed."
if ($failed -gt 0) {
  exit 1
}
