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
