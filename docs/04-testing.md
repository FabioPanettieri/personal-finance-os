# 04 — Testing Strategy

| Livello | Strumento | Cosa | Quando |
|---|---|---|---|
| Database | Suite SQL su PostgreSQL reale (`scripts/db-test-local.sh`) | RLS, isolamento utenti, vincoli, trigger, audit, storage | Ogni migration, CI |
| Unit | Vitest | `lib/*`: money, dates, csv, imports, transfers, categorization, analytics | Ogni modifica, CI |
| Integration | Vitest + Supabase locale | Server actions/repository: import end-to-end, commit idempotente | Sprint 3+, CI |
| E2E | Playwright su build di produzione + finto Supabase Auth (`tests/e2e/mock-supabase.mjs`) | Protezione route, login, MFA, persistenza sessione, logout, header di sicurezza, CSP, layout desktop/mobile, tema | Dallo Sprint 1, CI |
| Statico | `tsc --noEmit`, ESLint, Prettier | 0 errori, nessun `any` non motivato | Ogni commit |

## Casi obbligatori (specifica §42)

- **CSV**: import corretto per banca, colonne mancanti, date invalide, importi
  invalidi (`1.234,56`, `-1,234.56`, `(12,00)`, `€ 5`), encoding (UTF-8 con/senza
  BOM, UTF-16, Windows-1252 con `à`/`€`), delimitatore `;`/`,`/tab, righe vuote,
  duplicati nello stesso file e tra file sovrapposti.
- **Date**: fine mese, 29 febbraio, cambio ora legale, settimana ISO a cavallo
  d'anno (es. 2026-W53 / 2027-W01), nessuno slittamento di un giorno.
- **Money**: somme di molti importi senza errori (`0,1 + 0,2`), arrotondamenti
  FX, negativi.
- **Transfers**: ING → Revolut, Revolut → ING, Revolut → Trade Republic, importi
  uguali in date diverse (±3 giorni), falsi positivi (due spese uguali su conti
  diversi non sono un trasferimento), ambiguità (due candidati → nessun auto-match).
- **Analytics**: entrate, spese, rimborsi, risparmio, tasso di risparmio,
  patrimonio con e senza trasferimenti, investito vs rendimento.
- **Categorization**: priorità regole, override manuale, regola appresa,
  soglie di confidenza.
- **Security**: RLS e isolamento (già attivi, 59 asserzioni).

## Regole

- Fixture CSV sintetiche in `tests/fixtures/csv/`, con intestazioni realistiche
  e dati inventati. Mai export reali nel repository.
- Funzioni pure testate con tabelle di casi (`it.each`).
- Ogni bug corretto porta un test di regressione che fallisce prima della fix.
- La CI (GitHub Actions) esegue: install → typecheck → lint → unit → db test → build → E2E.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint, zero warning ammessi |
| `npm test` | Vitest (unit + componenti), processo in fuso `America/Los_Angeles` per far emergere slittamenti di data |
| `npm run test:db` | Migration + suite SQL su PostgreSQL temporaneo |
| `npm run test:e2e` | Build in `.next-e2e` collegata al finto Supabase, poi Playwright desktop + mobile (`PLAYWRIGHT_CHROMIUM_PATH` per usare un Chromium già installato) |
| `npm run check` | Tutto quanto sopra, in ordine |

Il finto Supabase implementa solo l'API GoTrue usata dall'app (password,
refresh, utente, TOTP, logout) con JWT HS256 reali e un utente fittizio: il
codice applicativo (`@supabase/ssr`, `getClaims`, proxy, layout) è quello di
produzione. Non sostituisce la verifica contro un progetto Supabase reale,
prevista quando il progetto verrà collegato.
