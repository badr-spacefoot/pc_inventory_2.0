param(
  [string]$Version = "0.0.0-dev",
  [string]$OsqueryMsiUrl = "",
  [switch]$SkipSign
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Require-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "$Name was not found. $InstallHint"
  }
  return $command.Source
}

function Find-SignTool {
  $signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
  if (-not $signTool) {
    throw "signtool.exe was not found. Install the Windows SDK or run with -SkipSign for an unsigned local smoke test."
  }
  return $signTool
}

function Find-InnoSetup {
  $command = Get-Command iscc -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $userPath = "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
  if (Test-Path $userPath) {
    return $userPath
  }

  $defaultPath = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
  if (Test-Path $defaultPath) {
    return $defaultPath
  }

  throw "Inno Setup compiler was not found. Install Inno Setup 6."
}

function Sign-File {
  param([string]$Target)

  if ($SkipSign) {
    Write-Host "Skipping signing for $Target"
    return
  }

  $signTool = Find-SignTool
  if ($env:WINDOWS_CODESIGN_PFX_BASE64) {
    $certPath = Join-Path $env:TEMP "spacefoot-codesign.pfx"
    [IO.File]::WriteAllBytes($certPath, [Convert]::FromBase64String($env:WINDOWS_CODESIGN_PFX_BASE64))
    & $signTool sign /f $certPath /p $env:WINDOWS_CODESIGN_PASSWORD /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Target
    if ($LASTEXITCODE -ne 0) { throw "Signing failed for $Target" }
    return
  }

  $cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq "CN=Spacefoot IT Collector Internal Testing" } |
    Select-Object -First 1
  if (-not $cert) {
    $cert = New-SelfSignedCertificate `
      -Type CodeSigningCert `
      -Subject "CN=Spacefoot IT Collector Internal Testing" `
      -FriendlyName "Spacefoot IT Collector Internal Testing" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm RSA `
      -KeyLength 3072 `
      -HashAlgorithm SHA256 `
      -NotAfter (Get-Date).AddYears(2)
  }

  New-Item -ItemType Directory -Force dist\installer | Out-Null
  Export-Certificate -Cert $cert -FilePath "dist\installer\spacefoot-it-collector-internal-test.cer" | Out-Null
  & $signTool sign /sha1 $cert.Thumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Target
  if ($LASTEXITCODE -ne 0) { throw "Signing failed for $Target" }
}

python -m PyInstaller --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller was not found. Install it with: python -m pip install --upgrade pyinstaller"
}
$iscc = Find-InnoSetup

New-Item -ItemType Directory -Force installer-assets | Out-Null
if (-not (Test-Path "installer-assets\osquery.msi")) {
  if ($OsqueryMsiUrl) {
    $downloadUrl = $OsqueryMsiUrl
  } else {
    $release = Invoke-RestMethod `
      -Headers @{ "User-Agent" = "spacefoot-it-collector-build" } `
      -Uri "https://api.github.com/repos/osquery/osquery/releases/latest"
    $asset = $release.assets |
      Where-Object { $_.name -match '\.msi$' -and $_.name -match 'osquery' } |
      Select-Object -First 1
    if (-not $asset) {
      throw "No osquery Windows MSI asset was found. Re-run with -OsqueryMsiUrl."
    }
    $downloadUrl = $asset.browser_download_url
  }

  Invoke-WebRequest -Uri $downloadUrl -OutFile "installer-assets\osquery.msi"
}

python -m PyInstaller `
  -y `
  --onedir `
  --windowed `
  --name "spacefoot-it-collector-windows" `
  --icon "frontend/assets/brand/app-icon.ico" `
  --add-data "scripts/collect-cross-platform.py;scripts" `
  --add-data "frontend/assets/brand/app-icon.png;assets/brand" `
  --hidden-import argparse `
  --hidden-import ctypes `
  --hidden-import datetime `
  --hidden-import getpass `
  --hidden-import os `
  --hidden-import platform `
  --hidden-import re `
  --hidden-import shutil `
  --hidden-import socket `
  --hidden-import subprocess `
  --hidden-import urllib.error `
  --hidden-import urllib.request `
  --hidden-import uuid `
  --hidden-import winreg `
  collectors/desktop_collector/collector_app.py

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller build failed."
}

$collectorExe = "dist\spacefoot-it-collector-windows\spacefoot-it-collector-windows.exe"
Sign-File $collectorExe

& $iscc "installer\windows\spacefoot-collector.iss" "/DAppVersion=$Version"
if ($LASTEXITCODE -ne 0) {
  throw "Inno Setup build failed."
}

$installer = "dist\installer\Spacefoot-IT-Collector-$Version-Setup.exe"
Sign-File $installer

Write-Host "Built $installer"
