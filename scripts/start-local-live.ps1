param(
  [int]$Port = 8090,
  [string]$ApiUrl = "https://oletfrcaptvardmdwacy.supabase.co/functions/v1/inventory-api"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Python = "C:\Program Files\Python314\python.exe"

if (-not (Test-Path $Python)) {
  $Python = "python"
}

& $Python "$Root\tools\local_live_server.py" --port $Port --api $ApiUrl
