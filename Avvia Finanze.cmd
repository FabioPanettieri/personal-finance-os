@echo off
rem Avvia Finanze sul PC: database locale + app su 127.0.0.1:3000 (mai esposta su Internet).
rem Dal telefono: tramite Tailscale, vedi docs/accesso-privato.md.
cd /d "%~dp0"
echo.
echo  Finanze - avvio
echo  1/3  Database locale (Docker Desktop deve essere aperto)...
call npx supabase start
if errorlevel 1 goto errore
if not exist .env.local call npm run env:local
if errorlevel 1 goto errore
if not exist node_modules call npm ci
if errorlevel 1 goto errore
echo  2/3  Preparo l'app (circa un minuto)...
call npm run build
if errorlevel 1 goto errore
echo.
echo  3/3  Pronta. Apri http://127.0.0.1:3000 (oppure il tuo indirizzo .ts.net).
echo       Per spegnere: chiudi questa finestra.
echo.
call npm run start
goto fine
:errore
echo.
echo  Qualcosa non va: leggi il messaggio qui sopra.
pause
:fine
