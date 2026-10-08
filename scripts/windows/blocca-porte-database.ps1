# Blocca l'accesso da altri dispositivi alle porte del database locale
# (Supabase in Docker ascolta su tutte le interfacce). Il PC stesso continua
# a usarle: il firewall di Windows non filtra il traffico verso 127.0.0.1.
# Eseguire UNA volta, da PowerShell come amministratore:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\blocca-porte-database.ps1
$ErrorActionPreference = 'Stop'
$name = 'Finanze - blocca database locale'
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Block -Protocol TCP -LocalPort '55320-55330' -Profile Any | Out-Null
Write-Host "OK: porte 55320-55330 bloccate per gli altri dispositivi."
