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
| XSS / clickjacking | React escaping, CSP con nonce per richiesta (`script-src 'nonce-…' 'strict-dynamic'`, `default-src 'self'`, connect solo verso Supabase), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS. `style-src` ammette `'unsafe-inline'` (attributi style di React/Next): gli script restano bloccati |
| CSRF sulle server action | Cookie `SameSite=Lax` + controllo `Origin` nativo delle Server Actions |
| Dati sensibili in cache del browser/PWA | Il service worker non mette in cache risposte con dati; `Cache-Control: private, no-store` sulle pagine autenticate |
| Dati inviati a servizi AI | Opt-in esplicito; solo descrizione normalizzata e segno importo; IBAN e numeri carta mascherati prima dell'invio |
| Log con dati finanziari | Logger server con redazione di importi/descrizioni; nessun dato finanziario nei messaggi d'errore mostrati |

## Autenticazione (implementata nello Sprint 1)

| Aspetto | Implementazione |
|---|---|
| Login | Email + password via Server Action (`features/auth/actions.ts`), validazione Zod, messaggio d'errore generico, 429 gestito |
| Registrazione | Assente: nessuna pagina, nessuna chiamata `signUp` (vietata da una regola ESLint), `enable_signup = false` in `supabase/config.toml`; sul progetto cloud va disattivato "Allow new users to sign up" |
| MFA | TOTP obbligatorio: senza fattore → `/mfa/setup` (QR + chiave), con fattore e sessione AAL1 → `/mfa/verify`. L'area app richiede AAL2 |
| Verifica identità | `getClaims()` verifica la firma del JWT (o interroga Supabase Auth con chiavi simmetriche). Il livello AAL viene dal claim verificato; i dati non verificati della sessione decidono solo *dove* reindirizzare, mai se concedere accesso |
| Sessione persistente | Cookie gestiti da `@supabase/ssr`; `proxy.ts` rinnova il token a ogni navigazione e riscrive i cookie |
| Protezione route | Doppia barriera: `proxy.ts` (regole pure in `lib/auth/access.ts`) e `requireUser()` nel layout `(app)` e nelle pagine sensibili. Le richieste di prefetch saltano il proxy ma non il layout |
| Supabase non configurato | Fail closed: nessuna pagina protetta raggiungibile, il login mostra l'avviso con le variabili mancanti |
| Redirect dopo login | `next` accettato solo se percorso interno dell'area app (`safeNextPath`): niente open redirect, preservato attraverso il passaggio MFA |
| Logout | Server Action `signOut({ scope: 'local' })` → `/login` |

Creazione del proprietario (una tantum): Supabase Dashboard → Authentication →
Users → *Add user* (oppure Studio locale con `supabase start`). Al primo
accesso l'app impone la configurazione del TOTP.

### Rischio aperto: MFA non imposta a livello di database

Le policy RLS verificano `user_id = auth.uid()` ma non il livello di
autenticazione. Il TOTP è obbligatorio nell'app (proxy + layout), ma un token
ottenuto con la sola password (AAL1) può interrogare direttamente l'API
PostgREST con la publishable key e leggere i propri dati. Mitigazione proposta
(richiede una migration, in attesa di approvazione): policy `as restrictive`
su ogni tabella utente che richiedono `(select auth.jwt() ->> 'aal') = 'aal2'`,
più test SQL e di integrazione dedicati.

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
CI (GitHub Actions, `.github/workflows/ci.yml`) a ogni push.

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
