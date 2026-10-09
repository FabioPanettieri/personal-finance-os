# Avvia Finanze in background (senza finestre): lo usa l'avvio automatico
# all'accesso a Windows. Aspetta Docker Desktop, avvia il database locale e
# l'app su 127.0.0.1:3000. Registro: %LOCALAPPDATA%\Finanze\avvio.log
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$logDir = Join-Path $env:LOCALAPPDATA 'Finanze'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir 'avvio.log') -Force | Out-Null

# Già acceso (per esempio da "Avvia Finanze")? Non serve altro.
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host 'Finanze e'' gia'' acceso.'
  Stop-Transcript | Out-Null
  exit 0
}

# Docker Desktop parte con Windows ma impiega un po': attesa fino a 10 minuti.
$dockerOk = $false
for ($i = 0; $i -lt 120; $i++) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { $dockerOk = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $dockerOk) { Write-Host 'Docker non risponde: avvia Docker Desktop.'; Stop-Transcript | Out-Null; exit 1 }

# Il database a volte non e' pronto al primo tentativo.
for ($i = 0; $i -lt 3; $i++) {
  npx.cmd supabase start
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 10
}
# Backup giornaliero (salta se ce n'e' gia' uno recente): docs/backup.md
node scripts\backup\backup.mjs --daily
# Aggiornamenti del database (solo le migration nuove, i dati restano).
npx.cmd supabase migration up --local
if (-not (Test-Path '.env.local')) { npm.cmd run env:local }
if (-not (Test-Path 'node_modules')) { npm.cmd ci }
# La build si rifà solo se manca (dopo un aggiornamento la fa "Avvia Finanze").
if (-not (Test-Path '.next\BUILD_ID')) { npm.cmd run build }
npm.cmd run start
Stop-Transcript | Out-Null
