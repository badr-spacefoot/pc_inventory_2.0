param(
  [string]$ApiUrl = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"
)

$ErrorActionPreference = "Stop"

function Read-Required {
  param([string]$Label)
  do {
    $value = Read-Host $Label
  } while ([string]::IsNullOrWhiteSpace($value))
  return $value.Trim()
}

Write-Host "Test de collecte Spacefoot" -ForegroundColor Cyan
Write-Host "Le token est saisi de maniere masquee et n'est pas enregistre."

$secureToken = Read-Host "COLLECTION_ACCESS_TOKEN" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)

  $profile = @{
    firstName = Read-Required "Prenom"
    lastName = Read-Required "Nom"
    email = Read-Required "Email"
    team = Read-Required "Equipe"
    establishment = Read-Required "Etablissement"
    service = Read-Required "Service"
    comment = Read-Host "Commentaire optionnel"
  }

  Write-Host "Creation du profil de collecte..." -ForegroundColor Cyan
  $profileResponse = Invoke-RestMethod `
    -Uri "$ApiUrl/collect/profile" `
    -Method Post `
    -Headers @{ "X-Collection-Access-Token" = $accessToken } `
    -ContentType "application/json" `
    -Body ($profile | ConvertTo-Json)

  if (-not $profileResponse.collectionToken) {
    throw "L'API n'a pas retourne de token temporaire."
  }

  $macAnswer = (Read-Host "Inclure l'adresse MAC ? (oui/non)").Trim().ToLowerInvariant()
  $includeMac = @("o", "oui", "y", "yes") -contains $macAnswer
  $collector = Join-Path $PSScriptRoot "collect-windows.ps1"

  Write-Host "Collecte et envoi de la configuration..." -ForegroundColor Cyan
  if ($includeMac) {
    & $collector -ApiUrl $ApiUrl -CollectionToken $profileResponse.collectionToken -IncludeMacAddress
  } else {
    & $collector -ApiUrl $ApiUrl -CollectionToken $profileResponse.collectionToken
  }

  if (-not $?) {
    throw "Le script de collecte a retourne une erreur."
  }

  Write-Host ""
  Write-Host "Test termine. Verifie la machine dans le dashboard Admin." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "Echec du test: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable accessToken -ErrorAction SilentlyContinue
  Read-Host "Appuie sur Entree pour fermer"
}
