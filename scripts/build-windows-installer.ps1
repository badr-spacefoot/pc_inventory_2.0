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

  if (-not $env:WINDOWS_CODESIGN_PFX_BASE64) {
    throw "Configure a trusted PFX certificate, or use -SkipSign for a local development smoke build."
  }
  $signTool = Find-SignTool
  $certPath = Join-Path $env:TEMP ("spacefoot-codesign-" + [Guid]::NewGuid().ToString('N') + ".pfx")
  try {
    [IO.File]::WriteAllBytes($certPath, [Convert]::FromBase64String($env:WINDOWS_CODESIGN_PFX_BASE64))
    & $signTool sign /f $certPath /p $env:WINDOWS_CODESIGN_PASSWORD /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Target
    if ($LASTEXITCODE -ne 0) { throw "Signing failed for $Target" }
  } finally {
    Remove-Item -LiteralPath $certPath -Force -ErrorAction SilentlyContinue
  }
}

if ($Version -ne "0.0.0-dev" -and ($SkipSign -or -not $env:WINDOWS_CODESIGN_PFX_BASE64)) { throw "Production builds require a trusted signing certificate" }
python -m pip install --require-hashes -r collectors/requirements-build.lock
if ($LASTEXITCODE -ne 0) { throw "Build dependency installation failed" }
python -m PyInstaller --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller was not found. Install it with: python -m pip install --upgrade pyinstaller"
}
$iscc = Find-InnoSetup

New-Item -ItemType Directory -Force installer-assets | Out-Null
python scripts/download-osquery.py windows
if ($LASTEXITCODE -ne 0) { throw "osquery verification failed" }
if ((Get-AuthenticodeSignature installer-assets/osquery.msi).Status -ne "Valid") { throw "Invalid osquery signature" }

python -m PyInstaller `
  -y `
  --onedir `
  --noupx `
  --windowed `
  --name "spacefoot-it-collector-windows" `
  --icon "frontend/assets/brand/app-icon.ico" `
  --add-data "scripts/collect-cross-platform.py;scripts" `
  --add-data "frontend/assets/brand/app-icon.png;assets/brand" `
  --paths "collectors/desktop_collector" `
  --hidden-import diagnostics `
  --hidden-import certifi `
  --hidden-import update_security `
  --hidden-import cryptography.hazmat.primitives.asymmetric.ed25519 `
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
