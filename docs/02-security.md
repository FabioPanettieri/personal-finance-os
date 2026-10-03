# 02 — Security Model

Privacy by design: l'app contiene l'intera storia finanziaria del proprietario.
Ogni livello presume che quello sopra possa fallire.

## Minacce considerate

| Minaccia | Mitigazione |
|---|---|
| Accesso di estranei all'app | Nessuna registrazione pubblica (signup disabilitato in Supabase Auth); utente creato a mano; TOTP obbligatorio (AAL2) dallo Sprint 1 |
| Utente che legge/scrive dati altrui | RLS su ogni tabella (`user_id = auth.uid()`), FK composte `(id, user_id)`, test SQL su Postgres reale |
| Chiave `anon` esposta nel bundle (è pubblica per natura) | `anon` non ha alcun privilegio sulle tabelle; solo `authenticated` + RLS |
| Fuga della `service_role` key | Solo variabili d'ambiente server, mai `NEXT_PUBLIC_*`; non usata nelle richieste utente; modulo `server-only` |
| Funzioni `security definer` come backdoor | `search_path = ''`, `revoke execute` da `public/anon/authenticated`, test che verificano il rifiuto |
| Manomissione dei dati originali | Trigger di immutabilità su `original_description`, `fingerprint`, conto, sorgente; audit log append-only |
| CSV malevolo | Limite 10 MB / 50.000 righe, MIME e estensione verificati, decodifica esplicita, nessuna `eval`, celle trattate come testo, regex utente limitate a 200 caratteri; neutralizzazione di `= + - @` all'esportazione (CSV injection) |
| File caricati leggibili da altri | Bucket `imports` privato, policy per cartella `{uid}/…`, nessuna policy di update |
| XSS / clickjacking | React escaping, CSP restrittiva (`default-src 'self'`, connect solo verso Supabase), `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer` |
| CSRF sulle server action | Cookie `SameSite=Lax` + controllo `Origin` nativo delle Server Actions |
| Dati sensibili in cache del browser/PWA | Il service worker non mette in cache risposte con dati; `Cache-Control: private, no-store` sulle pagine autenticate |
| Dati inviati a servizi AI | Opt-in esplicito; solo descrizione normalizzata e segno importo; IBAN e numeri carta mascherati prima dell'invio |
| Log con dati finanziari | Logger server con redazione di importi/descrizioni; nessun dato finanziario nei messaggi d'errore mostrati |

## Cosa l'app NON fa (per scelta)

- Non chiede né memorizza credenziali di ING, Revolut o Trade Republic.
- Nessuno scraping e nessuna integrazione bancaria (PSD2) non richiesta.
- Nessun dato reale nel repository: fixture e seed sono sintetici.

## Ruoli PostgreSQL

| Ruolo | Accesso |
|---|---|
| `anon` | Nessuno su `public` (revoke esplicite + default privileges) |
| `authenticated` | CRUD sulle proprie righe via RLS; `profiles` solo select/update; `account_types` e `audit_logs` solo select |
| `service_role` | Bypass RLS — solo script amministrativi (seed dev, backup) |

## RLS: verifica con test reali

`scripts/db-test-local.sh` crea un cluster PostgreSQL temporaneo, applica le
migration e lancia `supabase/tests/database.test.sql` impersonando due utenti
(`set role authenticated` + claim JWT) e il ruolo `anon`. Copre: lettura
isolata, inserimento con `user_id` altrui, riferimento a righe altrui tramite
FK, update/delete su righe altrui, cambio di proprietario, funzioni
privilegiate, audit, storage, anonimo. Dallo Sprint 1 la stessa suite gira in
CI (GitHub Actions) a ogni push.

## Segreti e ambienti

| Variabile | Dove | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | pubblica |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | pubblica, senza privilegi grazie a RLS |
| `SUPABASE_SECRET_KEY` | solo script locali / CI | mai su Vercel se non indispensabile |
| `ANTHROPIC_API_KEY` | server, Sprint 11+ | solo se AI attiva |

`.env*.local` in `.gitignore`; `.env.example` documenta i nomi senza valori.

## Backup

1. Supabase: backup giornalieri automatici (piano Pro: PITR consigliato).
2. Export settimanale cifrato: script `scripts/backup.ts` (Sprint 12) che
   esporta le tabelle dell'utente in JSON, cifrato con `age` verso una chiave
   pubblica del proprietario, salvato fuori da Supabase.
3. I CSV originali restano nel bucket privato: la base dati è ricostruibile
   reimportandoli (gli import sono idempotenti grazie al fingerprint).
