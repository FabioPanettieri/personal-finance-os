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

### MFA imposta anche dal database (migration 0005)

Fino alla migration 0004 il TOTP era obbligatorio solo nell'app: un token
ottenuto con la sola password (AAL1) poteva interrogare direttamente PostgREST.
Dalla migration `20261003000005_enforce_aal2.sql` l'accesso ai dati richiede
contemporaneamente:

1. ruolo `authenticated` (anon non ha privilegi);
2. proprietario corretto (`user_id = auth.uid()`, policy permissive esistenti);
3. sessione `aal2`: policy **restrictive** `for all to authenticated` con
   `((select auth.jwt()) ->> 'aal') = 'aal2'` sia in `using` sia in `with check`.

Le policy restrictive sono in AND con le permissive: non possono allargare
l'accesso. Un token senza claim `aal` è trattato come AAL1.

| Protetto (25 tabelle + Storage) | Non protetto, per scelta |
|---|---|
| accounts, transactions, transfer_groups, businesses, income_sources, transaction_categories, categorization_rules, import_profiles, imports, import_files, import_rows, investment_accounts, instruments, investment_plans, investment_transactions, investment_valuations, budgets, budget_categories, goals, goal_accounts, monthly_snapshots, yearly_snapshots, net_worth_snapshots, profiles, audit_logs; bucket `imports` | `account_types` (riferimento globale, nessun dato utente) |

La vista `account_balances` è `security_invoker`, quindi eredita le policy
delle tabelle sottostanti.

**Bootstrap del secondo fattore.** Enroll, challenge e verify del TOTP passano
dall'API di Supabase Auth, che scrive `auth.mfa_factors` con il proprio ruolo:
non sono toccati da queste policy e funzionano con una sessione AAL1. Il
profilo e i dati iniziali vengono creati dal trigger di signup (security
definer). L'app non legge dati finanziari prima dell'AAL2 (le pagine `/mfa/*`
usano solo l'API di Auth).

**Verifica.** Suite SQL (simulazione dei claim JWT) e test di integrazione con
sessioni reali emesse da Supabase Auth locale (`tests/integration/aal.test.ts`):
in AAL1 SELECT/INSERT/UPDATE/DELETE negati su tabelle e Storage; in AAL2 CRUD
consentito; isolamento tra utenti anche in AAL2; anonimo negato. Un test di
copertura fallisce se una tabella futura con `user_id` non ha la policy AAL2.
Controprova: senza la migration 0005 questi test falliscono.

### Importazioni (Sprint 3)

- Upload, anteprima, correzioni e conferma passano da Server Action con
  `requireUser()` (sessione AAL2) e dal client Supabase dell'utente: RLS e
  policy AAL2 valgono anche per Storage, `imports`, `import_files`,
  `import_rows`, `transactions` e `investment_transactions`.
- File: ≤ 10 MB, estensione `.csv`, MIME ammessi, rifiuto dei contenuti
  binari, decodifica esplicita, celle senza caratteri di controllo e con
  lunghezza limitata, massimo 50.000 righe. Nessuna valutazione del contenuto.
- Il file originale non è mai modificato (nessuna policy di update sullo Storage).
- Verificato con test di integrazione: AAL1 non può creare importazioni; un
  altro utente non legge importazioni, righe, file o transazioni, non modifica
  righe, non conferma e non importa su conti altrui.

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

Dettagli e istruzioni: [docs/backup.md](backup.md).

1. Backup locale automatico (Sprint 12, `scripts/backup/`): a ogni avvio di
   "Avvia Finanze" (prima delle migration) e una volta al giorno con l'avvio
   automatico. Dati di `public`, `auth` (senza sessioni) e `storage` con
   `pg_dump --data-only` eseguito nel container, più i file originali degli
   import. Ultime 30 copie, fuori da Docker e fuori dal repository.
2. Cifratura facoltativa con `BACKUP_PASSWORD` (AES-256-GCM, chiave scrypt,
   sale e IV casuali): obbligatoria se la cartella è su un servizio online.
   Il nome della cartella e `info.json` non contengono dati personali.
3. Ripristino in un'unica transazione (trigger sospesi con
   `session_replication_role`), preceduto da un backup di sicurezza; password
   sbagliata o backup di una versione più recente → nessuna modifica.
4. L'app legge solo i nomi delle cartelle e `info.json` per mostrare lo stato,
   mai il contenuto dei backup.
5. I CSV originali sono anche nel backup: la base dati resta ricostruibile
   reimportandoli (gli import sono idempotenti grazie al fingerprint).
