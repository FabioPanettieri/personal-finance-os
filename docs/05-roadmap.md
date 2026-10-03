# 05 — Sprint Plan e stato

Ogni sprint chiude solo con: test verdi, `tsc` 0 errori, build ok, lint ok,
report "SPRINT X — COMPLETED" qui sotto.

| Sprint | Obiettivo | Deliverable chiave | Acceptance |
|---|---|---|---|
| **0** Architecture | Fondamenta decise e verificate | Docs 00–05, schema SQL, RLS, suite DB | Migration applicate su Postgres reale, test DB verdi |
| **1** Foundation | Progetto funzionante e protetto | Next.js 16 + TS strict, Tailwind tokens, `components/ui` base, client Supabase SSR, login + TOTP, middleware, AppShell (sidebar + bottom nav), `lib/money`, `lib/dates`, CI | `npm run build` ok, `tsc` 0 errori, unit + DB test in CI |
| **2** Accounts | Conti | CRUD conti, saldo iniziale, dettaglio conto, saldo derivato | Saldi corretti da test |
| **3** CSV Import ★ | Import affidabile | Upload Storage, decode/parse, adapter ING/Revolut/TR, mapping configurabile, fingerprint, duplicati, anteprima con correzione, commit idempotente, storico | Reimport dello stesso file = 0 nuove righe |
| **4** Transactions | Explorer | Filtri, ricerca, ordinamento, modifica, bulk edit, categoria/business/fonte | Filtri via URL, bulk su 500 righe |
| **5** Transfers | Movimenti interni | `detectTransfer`, gruppi, conferma manuale, patrimonio invariato | Test ING↔Revolut↔TR |
| **6** Dashboard | Panoramica | Hero patrimonio, KPI, cash flow con range, entrate per fonte, spese per categoria | Numeri = analytics engine (test) |
| **7** Business | Gestionale | Personale vs Business, VOXEL Studio, YouTube, margini | Nessuna doppia conta |
| **8** Investments | Trade Republic | Versato, valore, P/L, PAC, valutazioni | Versamento ≠ rendimento |
| **9** Reports | Storico | Settimanale + insight, mensile, annuale, confronto anni, storico patrimonio | Insight solo da dati |
| **10** Goals | Obiettivi | CRUD, progresso manuale o da conti, scadenze, card in dashboard | |
| **11** Smart categorization | Classificazione | Regole avanzate, regole apprese dalle correzioni, confidenza, poi AI opt-in | Nessuna applicazione automatica sotto soglia |
| **12** Polish | Qualità | PWA completa, animazioni, a11y, empty/loading/error state, E2E, backup | Lighthouse PWA/a11y ≥ 95 |

## SPRINT 0 — COMPLETED

**Implemented**
- Architecture Plan, definizioni finanziarie, folder structure, route map,
  component map, data flow (`docs/00-architecture.md`)
- Database Schema Plan con diagramma ER (`docs/01-database.md`)
- Security Model (`docs/02-security.md`)
- Design System (`docs/03-design-system.md`)
- Testing Strategy (`docs/04-testing.md`)
- Harness per testare migration e RLS su PostgreSQL reale senza Docker
  (`scripts/db-test-local.sh` + stub Supabase in `supabase/tests/local/`)

**Database**
- 4 migration: schema (26 tabelle + vista `account_balances`), sicurezza (RLS
  su tutte le tabelle, revoke `anon`, audit log via trigger), storage (bucket
  privato `imports`), bootstrap utente (conti ING/Revolut/Trade Republic,
  3 business, 4 fonti di reddito, 17 macro-categorie + sottocategorie, 3 regole)
- FK composte `(id, user_id)` contro riferimenti tra utenti diversi
- Trigger: immutabilità dati originali, gerarchia categorie, tipo conto investimento, audit

**Tests**
- 59 passed, 0 failed (suite SQL su PostgreSQL 16)
- Mutation check: disattivando il trigger di immutabilità la suite fallisce come atteso

**TypeScript**: N/A (nessun codice applicativo in questo sprint)
**Build**: N/A (progetto Next.js creato allo Sprint 1)

**Known issues / decisioni aperte**
- Le intestazioni reali dei CSV di ING, Revolut e Trade Republic vanno
  confermate su export reali anonimizzati prima dello Sprint 3; gli
  `import_profiles` di default verranno creati solo allora.
- Lo stub Supabase locale replica solo ciò che serve ai test; allo Sprint 1 la
  stessa suite girerà anche contro `supabase start` (Supabase CLI + Docker).
- `pg_trgm` è creato nello schema `extensions` (convenzione Supabase).

**Next sprint**: Sprint 1 — Foundation.

## SPRINT 1 — COMPLETED

**Implemented**
- Progetto Next.js 16.3 (App Router, Turbopack) + React 19.3 + TypeScript 6.0
  strict (`noUncheckedIndexedAccess`) + Tailwind CSS 4.3
- Integrazione Supabase reale via `@supabase/ssr`: client server legato ai
  cookie, `proxy.ts` che rinnova la sessione, configurazione da variabili
  d'ambiente validate (`lib/env.ts`), `.env.example` documentato, nessuna chiave
- Auth: login, logout, sessione persistente, TOTP obbligatorio (setup + verify),
  protezione route a doppia barriera (proxy + layout), redirect sicuro con `next`
- Security: CSP con nonce per richiesta, header di sicurezza, fail closed senza
  configurazione, regola ESLint che vieta `signUp`
- Design system: token light/dark, tema persistente senza flash, 12 primitivi
  UI, `Money` con centesimi interi
- Layout responsive: sidebar desktop, top bar + bottom navigation mobile
  (5 voci, target ≥ 44 px, safe area iOS), skip link
- Routing iniziale: Home, Transazioni, Patrimonio, Analytics, Impostazioni (+
  Sicurezza), Conti, Investimenti, Report, Obiettivi, Importazioni
- Stati: loading (skeleton), error (Riprova), empty, not-found, global-error
- Librerie pure: `lib/money` (Cents), `lib/dates` (IsoDate, Europe/Rome),
  `lib/auth/access`, `lib/security/csp`, `lib/navigation`, `lib/theme`
- CI GitHub Actions: typecheck → lint → unit → DB → build → E2E
- `supabase/config.toml` per la CLI locale (signup off, TOTP on)

**Database**
- Nessuna nuova migration: le 4 migration dello Sprint 0 sono invariate.
- L'app legge solo `profiles` (creato dal trigger di signup dello Sprint 0).
- `types/database.ts` è un sottoinsieme scritto a mano (solo `profiles`), da
  sostituire con `supabase gen types` allo Sprint 2.

**Tests**
- Unit + componenti (Vitest): 76 passed, 0 failed
- Database (Sprint 0, regressione): 59 passed, 0 failed
- E2E (Playwright, desktop + mobile): 22 passed, 0 failed

**TypeScript**: PASS · **Lint**: PASS (0 warning) · **Build**: PASS

**Bug trovati e corretti durante lo sprint**
- Importi a 4 cifre senza separatore ("1234,56 €", regola CLDR it-IT). Fix:
  `useGrouping: 'always'`. Test di regressione: `5.200,00 €`.
- Dopo il login l'URL restava `/` mentre la pagina mostrava la configurazione
  TOTP, e l'azione successiva falliva (doppio redirect durante il render di una
  Server Action). Fix: il login reindirizza direttamente al passaggio MFA
  corretto, propagando `next`. Test E2E dedicati.

**Known issues**
- Login e MFA sono verificati contro un finto Supabase Auth: la prova contro un
  progetto reale avverrà quando verrà collegato.
- `types/database.ts` scritto a mano (vedi sopra).
- La PWA (manifest, service worker) resta allo Sprint 12, come da piano.

**Next sprint**: Sprint 2 — Accounts.

## SPRINT 2 — COMPLETED

**Implemented**
- Stack Supabase locale reale (CLI 2.119 via npm, Docker): Postgres 17,
  Auth, PostgREST, Storage; script `db:start`, `db:stop`, `db:reset`, `db:types`
- `types/database.ts` generato da `supabase gen types` (26 tabelle, 1 vista,
  15 enum, coerenti con le migration; output deterministico)
- `/accounts`: elenco conti attivi e disattivati con saldo, istituto, valuta,
  tipo, numero di transazioni, data dell'ultima transazione; saldo complessivo
  per valuta (liquidità + conti investimento al versato netto)
- `/accounts/[id]`: saldo, entrate, uscite (al netto dei rimborsi),
  trasferimenti in/out, versamenti verso investimenti, numero transazioni,
  ultima attività, grafico del saldo (solo con dati in ≥ 2 giorni), stato vuoto
- Modifica di nome, istituto, colore, saldo iniziale e relativa data;
  attivazione/disattivazione; valuta e tipo in sola lettura
- Repository tipizzato (`server/repositories/accounts.ts`) con lettura dei
  movimenti a pagine, logica pura in `lib/accounts`, parsing importi italiani
  in `lib/money/parse.ts`, scale grafiche in `lib/charts/scale.ts`
- Navigazione: Conti nella sidebar desktop; su mobile da Patrimonio e
  Impostazioni, senza nuove voci nella bottom nav (che evidenzia Patrimonio)
- CI: nuovo job `supabase-local` (stack locale, verifica tipi, SQL, API, E2E reali)

**Database**
- Nessuna nuova migration; le 4 migration dello Sprint 0 sono invariate e si
  applicano senza errori su Supabase locale (Postgres 17).
- Saldo mai memorizzato: viene dalla vista `account_balances`.

**Tests**
- Unit e componenti: 120 passed
- SQL su Postgres temporaneo: 73 passed (59 dello Sprint 0 + 14 su account/RLS)
- SQL su Supabase locale (schemi auth/storage reali): 73 passed
- Integrazione API su Supabase locale: 17 passed
- E2E con finto Supabase: 24 passed (desktop + mobile)
- E2E su Supabase locale: 11 passed, 1 saltato per scelta (desktop + mobile)

**Bug trovati e corretti**
- `supabase/config.toml` (Sprint 1): `[auth.email] enable_signup = false`
  disattivava l'intero provider email, quindi anche il login. La registrazione
  resta bloccata da `[auth] enable_signup = false`; test di integrazione dedicati.
- Form (login dello Sprint 1 e modifica conto): React 19 azzera i campi dopo una
  Server Action, quindi dopo un errore di validazione i valori digitati si
  perdevano e un salvataggio successivo poteva scrivere il saldo iniziale
  sbagliato. Fix: l'action restituisce i valori inviati. Regressione in E2E.
- Etichetta dell'ultima attività troncata su mobile.

**Known issues**
- RLS non richiede AAL2: vedi docs/02-security.md, migration proposta in attesa
  di approvazione.
- `npm audit`: 5 vulnerabilità "high" solo negli strumenti di sviluppo
  (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`), nessuna in
  produzione; la sola correzione disponibile è un downgrade a Next 14.
- Creazione ed eliminazione di conti non incluse (non richieste); un conto si
  archivia disattivandolo.

**Next sprint**: Sprint 3 — CSV Import.
