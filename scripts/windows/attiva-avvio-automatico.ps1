# Accende Finanze da solo quando accedi a Windows (collegamento nella
# cartella Esecuzione automatica, nessun permesso di amministratore).
# Uso, da PowerShell nella cartella del progetto:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\attiva-avvio-automatico.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script = Join-Path $root 'scripts\windows\avvio-silenzioso.ps1'
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Finanze.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = 'Avvia Finanze in background'
$shortcut.Save()
Write-Host 'OK: Finanze partira'' da solo a ogni accesso a Windows.'
Write-Host 'Per accenderlo adesso senza riavviare:'
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$script`""
