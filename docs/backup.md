# Backup e ripristino

I dati di Finanze vivono solo sul PC, nel database locale dentro Docker. Il
backup ne fa una copia **fuori da Docker**, così un problema a Docker, un
aggiornamento andato male o una cancellazione per errore non fanno perdere
nulla.

## Quando si fa (da solo)

- **Avvia Finanze**: un backup a ogni avvio, *prima* di applicare gli
  aggiornamenti del database.
- **Avvio automatico** (all'accesso a Windows): un backup al giorno; se ce n'è
  già uno delle ultime 20 ore, salta.
- A mano, quando vuoi, dalla cartella dell'app: `npm run backup`.

Se il backup non riesce (per esempio Docker non risponde), l'app parte lo
stesso e il motivo è nella finestra nera o in `%LOCALAPPDATA%\Finanze\avvio.log`.

L'app mostra lo stato in **Impostazioni → Backup**. Se l'ultimo backup ha più
di 7 giorni, o non ce n'è nessuno, compare anche un avviso in Home.

## Cosa contiene

Ogni backup è una cartella `finanze-AAAA-MM-GG-HHMM`, con dentro:

| File | Contenuto |
|---|---|
| `database.sql.gz` | Tutti i dati: movimenti, conti, regole, obiettivi, investimenti, import, account e verifica in due passaggi |
| `file.tar.gz` | I file originali degli estratti conto importati |
| `info.json` | Data, versione del database, cifrato sì/no (nessun dato personale) |

Restano fuori le sessioni di accesso: dopo un ripristino si rifà l'accesso.
Vengono conservate le ultime **30** copie e le più vecchie si cancellano da sole.

## Dove finisce

Predefinita: `Documenti\Finanze backup` (su Windows). Sta sullo stesso disco del
PC: protegge da problemi di Docker e da errori, ma non da un guasto del disco.
Per una **seconda copia** sicura, aggiungi a `.env.local` nella cartella
dell'app:

```
BACKUP_DIR=E:\Finanze backup
BACKUP_PASSWORD=una-frase-lunga-che-solo-tu-conosci
BACKUP_KEEP=30
```

- `BACKUP_DIR`: chiavetta USB, disco esterno o una cartella OneDrive.
- `BACKUP_PASSWORD`: cifra i file (AES-256-GCM, chiave derivata con scrypt).
  **Obbligatoria se la cartella è su OneDrive o su un altro servizio online.**
  Senza la password il backup non si apre: scrivila su carta e conservala.
- `BACKUP_KEEP`: quante copie tenere.

`.env.local` non finisce mai su GitHub.

## Ripristinare

Sostituisce **tutti** i dati attuali con quelli del backup scelto. Prima salva
da solo un backup dello stato attuale, quindi si può sempre tornare indietro.

1. Apri Docker Desktop e PowerShell nella cartella dell'app.
2. `npm run restore`: elenca i backup disponibili.
3. `npm run restore -- finanze-2026-10-09-1432` (oppure `npm run restore -- --latest`).
4. Scrivi `RIPRISTINA` per confermare.
5. Ricarica l'app e rifai l'accesso.

Sicurezze:
- tutto il database si ripristina in un'unica transazione: se qualcosa va
  storto, i dati restano com'erano;
- con una password sbagliata non si tocca nulla;
- un backup creato da una versione più recente dell'app non si ripristina su
  una più vecchia: prima aggiorna l'app.

## Su un PC nuovo

1. Installa Docker Desktop, Node.js e l'app (come nella prima installazione).
2. Fai doppio clic su **Avvia Finanze** una volta e aspetta "Pronta".
3. Copia la cartella dei backup e imposta `BACKUP_DIR` (e `BACKUP_PASSWORD`, se
   serve) in `.env.local`.
4. `npm run restore -- --latest`.

## Per lo sviluppo

`npm run test:backup` prova davvero backup e ripristino sullo stack Supabase
locale: backup cifrato, cancellazione di utenti e file, ripristino, stessi
conteggi di prima, password sbagliata rifiutata senza modifiche. Gira in CI a
ogni push. Codice: `scripts/backup/`.
