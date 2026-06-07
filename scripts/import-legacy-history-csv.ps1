param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,

  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [string]$Username,

  [string]$Password,

  [int]$BatchSize = 100
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
  throw "CSV introuvable: $CsvPath"
}

if ([string]::IsNullOrWhiteSpace($Username)) {
  $Username = Read-Host "Identifiant admin"
}

if ([string]::IsNullOrWhiteSpace($Password)) {
  $securePassword = Read-Host "Mot de passe admin" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  } finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
  }
}

function Convert-LegacyDate {
  param([string]$Value)

  $parsedDate = [datetime]::MinValue
  if ([datetime]::TryParseExact(
    $Value,
    "dd/MM/yyyy HH:mm:ss",
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeLocal,
    [ref]$parsedDate
  )) {
    return $parsedDate.ToUniversalTime().ToString("o")
  }

  if ([datetime]::TryParse($Value, [ref]$parsedDate)) {
    return $parsedDate.ToUniversalTime().ToString("o")
  }

  return $Value
}

$loginBody = @{
  username = $Username
  password = $Password
} | ConvertTo-Json

$login = Invoke-RestMethod -Uri "$ApiUrl/auth/admin" -Method Post -ContentType "application/json" -Body $loginBody
$headers = @{
  Authorization = "Bearer $($login.token)"
  "Content-Type" = "application/json"
}

$rows = Import-Csv -LiteralPath $CsvPath -Encoding UTF8
$payloadRows = foreach ($row in $rows) {
  $values = @($row.PSObject.Properties | ForEach-Object { "$($_.Value)".Trim() })
  if ($values.Count -lt 14) {
    Write-Warning "Ligne historique ignoree: colonnes manquantes"
    continue
  }

  @{
    timestamp = Convert-LegacyDate $values[0]
    action = $values[1]
    mac = $values[2]
    hostname = $values[3]
    osType = $values[4]
    firstName = $values[5]
    lastName = $values[6]
    team = $values[7]
    establishment = $values[8]
    osUser = $values[9]
    previousFirstName = $values[10]
    previousLastName = $values[11]
    previousTeam = $values[12]
    previousEstablishment = $values[13]
  }
}

$imported = 0
$unmatched = 0
$duplicates = 0
$failed = 0

for ($offset = 0; $offset -lt $payloadRows.Count; $offset += $BatchSize) {
  $end = [Math]::Min($offset + $BatchSize - 1, $payloadRows.Count - 1)
  $batch = @($payloadRows[$offset..$end])
  $body = @{ rows = $batch } | ConvertTo-Json -Depth 8

  try {
    $result = Invoke-RestMethod -Uri "$ApiUrl/admin/legacy-history/import" -Method Post -Headers $headers -Body $body
    $imported += [int]$result.imported
    $unmatched += @($result.unmatched).Count
    $duplicates += [int]$result.skippedDuplicates
    Write-Host "Lot importe: $($result.imported). Sans correspondance: $(@($result.unmatched).Count). Deja presents: $($result.skippedDuplicates)." -ForegroundColor Green
  } catch {
    $failed++
    Write-Host "Import historique KO pour le lot $offset-$end" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
      Write-Host $_.ErrorDetails.Message
    }
  }
}

Write-Host "Import historique termine. Importes: $imported. Sans correspondance: $unmatched. Deja presents: $duplicates. Lots echoues: $failed."
if ($failed -gt 0) {
  exit 1
}
