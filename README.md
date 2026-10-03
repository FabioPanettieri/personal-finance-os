# Personal Finance OS

Applicazione privata per la gestione delle finanze personali: aggrega i
movimenti di ING Direct, Revolut e Trade Republic tramite import CSV e li
trasforma in una base dati storica per patrimonio, entrate, spese, business e
investimenti.

Stato: **Sprint 2 — Accounts** completato. Vedi [`docs/05-roadmap.md`](docs/05-roadmap.md).

## Stack

Next.js 16 (App Router, Server Actions, `proxy.ts`) · React 19 · TypeScript 6
strict · Tailwind CSS 4 · Supabase (Postgres, Auth con TOTP obbligatorio,
Storage, RLS) · Vitest · Playwright.

## Avvio in locale

```bash
npm install
cp .env.example .env.local   # compila NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000
```

Senza variabili Supabase l'app parte comunque, ma resta chiusa: il login
mostra quali variabili mancano e nessuna pagina protetta è raggiungibile.

### Stack Supabase locale (consigliato per lo sviluppo)

Richiede Docker. Nessun progetto cloud, nessun dato reale.

```bash
npm run db:start          # Postgres + Auth + PostgREST + Storage, migration applicate
npx supabase status       # URL e publishable key locali da copiare in .env.local
npm run dev
```

Crea l'utente di sviluppo da Studio locale (`npx supabase start` senza `-x studio`)
oppure con l'Admin API usando la secret key **locale**. `npm run db:reset`
riapplica le migration da zero; `npm run db:stop` ferma lo stack.

### Collegare un progetto Supabase

1. Crea il progetto (regione EU) oppure avvia lo stack locale con `supabase start`.
2. Applica le migration di `supabase/migrations/` (`supabase db push` o SQL Editor).
3. Disattiva la registrazione pubblica (Authentication → Sign In / Providers →
   *Allow new users to sign up* = off) e verifica che il TOTP sia abilitato.
4. Crea l'utente proprietario (Authentication → Users → *Add user*).
5. Copia URL e publishable key in `.env.local` (in produzione: variabili
   d'ambiente Vercel, presenti anche al momento della build).
6. Al primo accesso l'app chiede di configurare l'app di autenticazione.

## Comandi

| Comando | Descrizione |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` / `npm start` | Build e avvio di produzione |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (zero warning) |
| `npm test` | Test unitari e di componente |
| `npm run test:db` | Migration + test RLS su PostgreSQL temporaneo (richiede PostgreSQL 15+) |
| `npm run test:e2e` | E2E Playwright su build di produzione con finto Supabase Auth |
| `npm run db:start` / `db:stop` / `db:reset` | Stack Supabase locale |
| `npm run db:types` | Rigenera `types/database.ts` |
| `npm run test:db:supabase` | Test SQL sul database dello stack locale |
| `npm run test:integration` | Test di integrazione contro l'API locale |
| `npm run test:e2e:local` | E2E contro lo stack locale (login e TOTP reali) |
| `npm run check` | Tutti i controlli |

## Documentazione

| Documento | Contenuto |
|---|---|
| [00 — Architecture](docs/00-architecture.md) | Stack, principi, definizioni finanziarie, struttura, route, componenti, data flow |
| [01 — Database](docs/01-database.md) | Schema, relazioni, convenzioni |
| [02 — Security](docs/02-security.md) | Modello di sicurezza, autenticazione, RLS, segreti, backup |
| [03 — Design System](docs/03-design-system.md) | Tipografia, colori, layout, grafici |
| [04 — Testing](docs/04-testing.md) | Strategia e comandi di test |
| [05 — Roadmap](docs/05-roadmap.md) | Sprint e report di avanzamento |

## Principi non negoziabili

- Importi in centesimi interi, mai float.
- I dati originali della banca non vengono mai sovrascritti.
- Trasferimenti tra conti propri non sono né entrate né spese.
- Nessuna credenziale bancaria, nessuno scraping: solo CSV.
- Ogni utente vede solo i propri dati (RLS verificata da test).
- Nessuna chiave reale nel repository.
