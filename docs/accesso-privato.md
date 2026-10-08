# Accesso privato: solo il tuo PC e il tuo telefono

L'app **non è su Internet**. Gira sul tuo PC e risponde solo a `127.0.0.1`
(il PC stesso). Il telefono la raggiunge attraverso **Tailscale**, una rete
privata cifrata tra i tuoi dispositivi: nessuna porta aperta sul router,
nessun indirizzo pubblico.

```
Telefono ──(Tailscale, cifrato)──► PC: tailscale serve ──► 127.0.0.1:3000 (Next.js)
                                                         └► 127.0.0.1:55321 (Supabase, solo dal server)
```

Il browser non parla mai con il database: lo fa solo il server Next.js sul PC.
Per questo basta esporre l'app, e solo dentro la tua rete Tailscale.

## Una volta sola

1. **Tailscale sul PC e sul telefono**: installa l'app da <https://tailscale.com/download>
   su entrambi e accedi con **lo stesso account**.
2. **HTTPS in Tailscale**: nella console <https://login.tailscale.com/admin/dns>
   attiva *MagicDNS* e *HTTPS Certificates*.
3. **Blocca le porte del database** agli altri dispositivi (PowerShell **come amministratore**,
   nella cartella del progetto):
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\windows\blocca-porte-database.ps1
   ```
4. **Pubblica l'app nella tua rete privata** (PowerShell normale):
   ```powershell
   tailscale serve --bg 3000
   ```
   Il comando stampa l'indirizzo, del tipo `https://nome-pc.tuo-tailnet.ts.net`.
   La configurazione resta attiva anche dopo il riavvio del PC.
   **Non usare `tailscale funnel`**: renderebbe l'app pubblica su Internet.

## Ogni volta

1. Apri **Docker Desktop**.
2. Doppio clic su **`Avvia Finanze.cmd`** nella cartella del progetto.
3. Apri `https://nome-pc.tuo-tailnet.ts.net` (dal PC puoi usare anche `http://127.0.0.1:3000`).

## Avvio automatico (consigliato)

Finanze si accende da solo quando accedi a Windows, in background, senza finestre.
Serve che Docker Desktop parta con Windows (Docker Desktop → Settings →
General → *Start Docker Desktop when you sign in*).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\attiva-avvio-automatico.ps1
```

- Registro dell'avvio: `%LOCALAPPDATA%\Finanze\avvio.log`.
- Per spegnerlo e togliere l'avvio automatico:
  `powershell -ExecutionPolicy Bypass -File scripts\windows\disattiva-avvio-automatico.ps1`.
- Dopo un aggiornamento del codice: disattiva, avvia una volta `Avvia Finanze.cmd`
  (rifà la build), chiudilo e riattiva l'avvio automatico dalla cartella nuova.

## Installa l'app sul PC

Apri l'indirizzo `.ts.net` in Chrome (icona *Installa* nella barra degli
indirizzi) o in Edge (menu … → *App* → *Installa questo sito come app*).

## Installa l'app sul telefono

- **Android (Chrome)**: apri l'indirizzo `.ts.net` → menu ⋮ → *Installa app*.
- **iPhone (Safari)**: apri l'indirizzo `.ts.net` → Condividi → *Aggiungi alla schermata Home*.

Si apre a schermo intero con l'icona di Finanze. Con il telefono fuori casa
funziona lo stesso, se Tailscale è attivo sul telefono e il PC è acceso.

## Verifiche

- Da un dispositivo **senza** Tailscale l'indirizzo `.ts.net` non risponde.
- `tailscale serve status` mostra `https://…ts.net → http://127.0.0.1:3000`.
- Per togliere l'accesso dal telefono: `tailscale serve reset`.
