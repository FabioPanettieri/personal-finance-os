# Toglie l'avvio automatico e spegne Finanze se e' acceso.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\disattiva-avvio-automatico.ps1
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Finanze.lnk'
if (Test-Path $link) { Remove-Item $link }
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Write-Host 'OK: avvio automatico disattivato, Finanze spento.'
