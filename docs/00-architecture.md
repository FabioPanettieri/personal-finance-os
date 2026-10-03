# 00 — Architecture Plan

Personal Finance OS: applicazione privata (un solo proprietario) che costruisce
nel tempo una base dati storica a partire dai CSV di ING, Revolut e Trade
Republic. Priorità: **dati corretti → import affidabile → classificazione
corretta → analytics corrette → UI eccellente**.

## 1. Stack

| Livello | Scelta | Motivo |
|---|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions), React 19 | Rendering server-side dei dati sensibili, niente API pubblica da esporre |
| Linguaggio | TypeScript 6.0 `strict` + `noUncheckedIndexedAccess` | Zero `any`, tipi DB generati. TS 7 escluso finché typescript-eslint non lo supporta (`<6.1`) |
| DB / Auth / Storage | Supabase (PostgreSQL 15+, Auth, Storage, RLS) | RLS come ultima linea di difesa |
| Hosting | Vercel (regione `fra1`, vicina al progetto Supabase EU) | Deploy Next.js nativo |
| Styling | Tailwind CSS 4 + design tokens CSS (`@theme`) | Dark/light via variabili |
| Primitivi UI | Radix UI (dialog, popover, select, tabs…) + componenti propri | Accessibilità senza look da template |
| Grafici | Recharts 3 (wrapper propri in `components/charts`) | Composizione React, tooltip custom |
| CSV | PapaParse (parsing) + decoder `TextDecoder` per encoding | Streaming, delimitatore auto |
| Validazione | Zod 4 (input form, server actions, righe CSV) | Un solo schema client/server |
| Denaro | Interi in centesimi (`bigint` DB ↔ `number` safe-integer TS, tipo brand `Cents`) | Nessun float nei calcoli |
| Quantità titoli | `numeric` DB ↔ `decimal.js` TS | Frazioni di ETF dei PAC |
| Date | `date` DB ↔ stringa `YYYY-MM-DD` brand `IsoDate` in TS; fuso `Europe/Rome` esplicito | Nessuna conversione implicita UTC |
| Test | Vitest (unit/integration), suite SQL su Postgres reale (RLS), Playwright (E2E contro build di produzione + finto Supabase Auth) | |
| PWA | Serwist (`@serwist/next`) | Service worker senza cache dei dati finanziari |

Versioni verificate su npm il 03/10/2026: next 16.3, react 19.3, tailwindcss
4.3, @supabase/ssr 0.12, @supabase/supabase-js 2.117, zod 4.6, vitest 5.0,
recharts 3.10, papaparse 5.7, decimal.js 10.6, @serwist/next 9.5. Dallo
Sprint 1 le versioni installate sono fissate nel `package-lock.json`
(ESLint resta alla 9: `eslint-plugin-react` non supporta ancora la 10).

## 2. Principi architetturali

1. **Livelli separati**: UI (`components`, `app`) → feature (`features/*`) →
   logica pura (`lib/*`) → accesso dati (`server/*`). La logica in `lib/` non
   importa React né Supabase: è testabile in isolamento.
2. **Logica di dominio pura**: parsing CSV, normalizzazione, fingerprint,
   rilevamento trasferimenti, categorizzazione e analytics sono funzioni pure
   `input → output`. Le server action orchestrano, non calcolano.
3. **Un solo punto di accesso ai dati**: le query vivono in `server/repositories/*`.
   Nessuna query Supabase sparsa nei componenti.
4. **Server-first**: le pagine leggono i dati in React Server Components con il
   client Supabase legato ai cookie dell'utente (RLS sempre attiva). Il client
   browser serve solo per interazioni puntuali.
5. **Mai `service_role` nel percorso delle richieste utente**: usato solo da
   script amministrativi (seed di sviluppo, backup).
6. **Il dato originale è sacro**: `original_description`, `raw` della riga CSV e
   il file caricato restano intatti; ogni correzione è un nuovo valore accanto.
7. **Snapshot = cache**: `monthly/yearly_snapshots` sono ricalcolabili da
   `transactions`; la fonte di verità resta sempre la tabella transazioni.

## 3. Definizioni finanziarie (contratto dell'analytics engine)

Tutti gli importi in centesimi, periodo `[from, to]` su `booked_on` inclusivo.

| Metrica | Definizione |
|---|---|
| **Entrate** | Σ `amount` con `type = income` |
| **Spese** | Σ `-amount` con `type = expense` − Σ `amount` con `type = refund` (i rimborsi riducono la spesa della loro categoria) |
| **Risparmio operativo** | Entrate − Spese |
| **Tasso di risparmio** | Risparmio / Entrate (null se Entrate = 0) |
| **Investito (versato)** | Σ `-amount` con `type = investment` sui conti liquidi (denaro uscito verso il broker) |
| **Trasferimenti** | `type = transfer`: esclusi da entrate, spese, risparmio |
| **Saldo conto** | `initial_balance + Σ amount` (vista `account_balances`) |
| **Valore conto investimento** | ultima `investment_valuations` del conto; se assente, saldo di cassa + costo dei titoli |
| **Patrimonio netto** | Σ saldi conti liquidi + Σ valore conti investimento. I trasferimenti interni non lo modificano per costruzione (le due gambe si compensano) |
| **Rendimento investimenti** | Valore attuale − capitale netto versato (versamenti − prelievi). Mai mescolato con i versamenti |
| **Risultato business** | Entrate con `business_id = X` − Spese con `business_id = X`; margine = risultato / entrate |

`type` vs `nature`: `type` dice *cosa* è il movimento (entrata, spesa…),
`nature` *a quale sfera* appartiene (personale, business…). Esempio: acquisto
filamento per VOXEL → `type = expense`, `nature = business`, `business = VOXEL Studio`.
Vincoli DB garantiscono la coerenza (es. `transfer ⇔ nature transfer`).

Movimenti tra conti propri:

| Movimento | type | nature | Effetto |
|---|---|---|---|
| ING → Revolut | `transfer` (entrambe le gambe) | `transfer` | Solo saldi conti |
| Revolut → ING | `transfer` | `transfer` | Solo saldi conti |
| Revolut/ING → Trade Republic | `investment` lato conto liquido, `transfer` lato broker | `investment` / `transfer` | Conta come *Investito*; patrimonio invariato |
| Acquisto ETF su TR | `investment_transactions.kind = buy` | — | Nessun effetto su entrate/spese |

## 4. Folder structure

```
personal-finance-os/
├─ app/                              # Routing Next.js (solo composizione)
│  ├─ (auth)/login/                  # Login (nessuna registrazione pubblica)
│  ├─ (auth)/mfa/{setup,verify}/     # TOTP obbligatorio
│  ├─ (app)/                         # Area autenticata, layout con nav
│  │  ├─ page.tsx                    # Dashboard
│  │  ├─ transactions/
│  │  ├─ net-worth/
│  │  ├─ analytics/ …                # vedi Route Map
│  │  ├─ imports/
│  │  └─ settings/
│  ├─ api/                           # Solo endpoint indispensabili (es. upload)
│  ├─ manifest.ts                    # PWA manifest
│  └─ sw.ts                          # Service worker (Serwist)
├─ components/
│  ├─ ui/                            # Primitivi del design system (Button, Card, Money…)
│  ├─ charts/                        # Wrapper Recharts tematizzati
│  └─ layout/                        # Sidebar, BottomNav, PageHeader
├─ features/                         # Moduli verticali: componenti + hook + action
│  ├─ dashboard/  transactions/  imports/  accounts/  analytics/
│  ├─ investments/  goals/  reports/  businesses/  settings/
│  └─ <feature>/{components,actions.ts,queries.ts,schemas.ts}
├─ lib/                              # Logica pura, zero dipendenze da React/Supabase
│  ├─ money/                         # Cents, parse/format, somme sicure
│  ├─ dates/                         # IsoDate, settimane ISO, mesi, range, Europe/Rome
│  ├─ csv/                           # decodeFile, detectDelimiter, parseCsv, bank adapters
│  ├─ imports/                       # normalizeRow, fingerprint, detectDuplicate, buildPreview
│  ├─ transfers/                     # detectTransfer (matching coppie)
│  ├─ categorization/                # rules engine, learned rules, confidence
│  ├─ analytics/                     # calculateTotalIncome() … calculateAnnualReport()
│  └─ insights/                      # Testi insight settimanali derivati dai dati
├─ server/                           # Solo server ('server-only')
│  ├─ supabase/                      # client server (cookie), resolveSession (getClaims + AAL)
│  ├─ auth/                          # getAuth, requireUser, requireSession, getProfile
│  ├─ repositories/                  # Accesso dati tipizzato per tabella/aggregato
│  └─ services/                      # Orchestrazione (commitImport, rebuildSnapshots)
├─ hooks/                            # Hook React condivisi (useMediaQuery, useTheme…)
├─ types/
│  ├─ database.ts                    # Generato: supabase gen types
│  └─ domain.ts                      # Tipi di dominio (Transaction, Account…)
├─ supabase/
│  ├─ migrations/                    # Schema versionato (unica fonte del DB)
│  ├─ tests/                         # Suite SQL RLS/vincoli
│  └─ seed.sql                       # Solo sviluppo: utente demo + dati sintetici
├─ tests/
│  ├─ fixtures/csv/                  # CSV sintetici per banca (mai dati reali)
│  └─ e2e/                           # Playwright
├─ scripts/                          # db-test-local.sh, generate-demo-data.ts
└─ docs/
```

Regola di dipendenza (verificata con ESLint `import/no-restricted-paths`):
`app → features → (components, lib, server)`; `lib` non importa nulla di
progetto se non `lib`; `components/ui` non importa `features` né `server`.

> Nota: la specifica cita `pages/`; con l'App Router il ruolo è svolto da
> `app/`. Non useremo il Pages Router.

## 5. Route Map

Tutte le route sotto `(app)` richiedono sessione AAL2. In Next.js 16 il
middleware si chiama **proxy** (`proxy.ts`): genera il nonce CSP, rinnova la
sessione e reindirizza a `/login`.

| Route | Pagina | Sprint |
|---|---|---|
| `/login` | Accesso email + password | 1 |
| `/mfa/setup` | Configurazione TOTP (obbligatoria al primo accesso) | 1 |
| `/mfa/verify` | Codice TOTP a ogni nuovo accesso | 1 |
| `/` | Dashboard: patrimonio, KPI, cash flow, entrate/spese | 6 |
| `/transactions` | Transaction Explorer (filtri in query string) | 4 |
| `/transactions/[id]` | Dettaglio/modifica (drawer su desktop, pagina su mobile) | 4 |
| `/accounts` | Elenco conti, saldi, totale per valuta (su mobile da Patrimonio) | 2 ✓ |
| `/accounts/[id]` | Dettaglio: saldo, entrate, uscite, trasferimenti, grafico, impostazioni | 2 ✓ |
| `/net-worth` | Patrimonio per conto + storico | 5–9 |
| `/analytics` | Hub analytics (entrate, spese, categorie) | 6 |
| `/analytics/business` | Personale vs Business | 7 |
| `/analytics/business/[slug]` | Dashboard singolo business (VOXEL, YouTube…) | 7 |
| `/investments` | Trade Republic: versato, valore, P/L, PAC | 8 |
| `/reports/weekly` | Report settimanale (`?week=2026-W40`) | 9 |
| `/reports/monthly` | Report mensile (`?month=2026-09`) | 9 |
| `/reports/annual` | Report annuale (`?year=2026`) | 9 |
| `/reports/compare` | Confronto anni | 9 |
| `/goals` | Obiettivi | 10 |
| `/imports` | Storico importazioni | 3 ✓ |
| `/imports/new` | Banca → conto → file → anteprima | 3 ✓ |
| `/imports/[id]` | Anteprima con filtri e correzioni, conferma; dettaglio a importazione completata | 3 ✓ |
| `/settings` | Indice impostazioni | 1+ |
| `/settings/{profile,accounts,categories,businesses,income-sources,rules,imports,goals,preferences,security}` | Sezioni §44 | 2–11 |

Navigazione primaria (bottom nav mobile / sidebar desktop): **Home,
Transazioni, Patrimonio, Analytics, Impostazioni**. Importa CSV è un'azione
primaria sempre raggiungibile (FAB su mobile, pulsante in header su desktop).

## 6. Component Map

```
RootLayout (theme, font, toaster)
└─ AppShell
   ├─ Sidebar (≥ lg)            ├─ BottomNav (< lg)         ├─ TopBar (titolo, periodo, Importa)
   └─ <page>
      Dashboard
      ├─ NetWorthHero           → Money, DeltaBadge, Sparkline
      ├─ KpiGrid                → KpiCard ×4 (Entrate, Spese, Risparmio, Investimenti)
      ├─ CashFlowChart          → RangeTabs, AreaChart, ChartTooltip
      ├─ IncomeBySource         → BarList, DeltaBadge
      └─ ExpensesByCategory     → DonutChart, CategoryList → link /transactions?category=
      TransactionExplorer
      ├─ FilterBar (Conto, Periodo, Categoria, Tipo, Natura, Business, Importo, Fonte)
      ├─ TransactionTable (desktop, virtualizzata) | TransactionList (mobile)
      ├─ BulkActionBar          → CategoryPicker, BusinessPicker
      └─ TransactionEditor      → Drawer/Sheet, SuggestionCard (Conferma/Modifica/Ignora)
      ImportWizard
      ├─ BankStep → AccountStep → FileDropzone → MappingStep (ColumnMapper)
      ├─ ImportPreview          → PreviewSummary, PreviewTable (stato riga, correzione inline)
      └─ ImportResult
      Investments: PortfolioSummary, ContributionVsReturnChart, PacCard
      Reports: PeriodPicker, ComparisonCards, InsightList, YearComparisonChart
      Goals: GoalCard (ProgressBar), GoalEditor
      Settings: SettingsNav, CrudList<T> (conti, categorie, business, fonti, regole), MappingEditor
```

Primitivi `components/ui`: `Button, IconButton, Card, Stat, Money, DeltaBadge,
Badge, Input, AmountInput, DateRangePicker, Select, Combobox, Tabs,
SegmentedControl, Dialog, Sheet, Drawer, Table, EmptyState, Skeleton,
ErrorState, Toast, ProgressBar, CategoryDot`.

`Money` è l'unico modo di mostrare un importo: riceve `Cents`, formatta con
`Intl.NumberFormat('it-IT', { style: 'currency' })`, cifre tabulari, colore
semantico opzionale, modalità privacy (importi offuscati).

## 7. Data Flow

### 7.1 Import CSV (cuore del sistema)

```
[Browser] scelta banca + conto + file
   │  (validazione client: estensione, ≤ 10 MB)
   ▼
[Server Action createImport]
   1. auth.getUser()  →  verifica conto dell'utente
   2. upload in Storage  imports/{uid}/{importId}/file.csv  + sha256
   3. lib/csv: decodeFile (BOM/UTF-8/UTF-16/Windows-1252) → detectDelimiter → parseCsv
   4. lib/csv/adapters/{ing,revolut,trade-republic}: headers → mapping (profilo salvato o auto-match)
   5. per riga: parseDate · parseAmount · normalizeDescription · detectCurrency  (riga invalida ≠ crash)
   6. fingerprint(account, date, amount, normalizedDescription, occurrenceIndex)
   7. detectDuplicate: fingerprint esistente → duplicate; match fuzzy → possible_duplicate
   8. categorizeTransaction: regole utente → regole apprese → (AI, opzionale) → confidenza
   9. detectTransfer: cerca la gamba opposta su altri conti (±3 giorni, stesso importo)
  10. salva imports(status = preview) + import_rows
   ▼
[Browser] /imports/[id]  anteprima: riepilogo + tabella, correzioni inline
   ▼
[Server Action commitImport]  (transazione DB unica, idempotente)
   - inserisce solo righe new (+ possible_duplicate confermate dall'utente)
   - crea transfer_groups per le coppie confermate
   - salva come regole "learned" le correzioni manuali
   - aggiorna contatori import, status = committed
   - ricalcola snapshot dei mesi toccati
```

`unique (account_id, fingerprint)` rende il commit sicuro anche se ripetuto:
un doppio click o un retry non può duplicare righe.

### 7.2 Lettura dashboard

```
RSC page → server/repositories (query con RLS, filtro periodo)
        → lib/analytics (funzioni pure sui dati tipizzati)
        → props serializzabili → componenti client per i grafici
```

### 7.3 Modifica transazione

```
TransactionEditor → Server Action (Zod) → repository.update (RLS)
  → trigger audit_logs → se cambia la categoria: proponi "crea regola"
  → revalidatePath delle viste interessate
```

## 7.4 Importazione CSV — implementazione (Sprint 3)

| Fase | Modulo |
|---|---|
| Validazione file (estensione, MIME, ≤ 10 MB, non binario) | `lib/imports/pipeline.ts` → `validateFile` |
| Decodifica (BOM, UTF-8, UTF-16, Windows-1252) | `lib/csv/decode.ts` |
| Riconoscimento fonte (punteggio per importer) | `lib/imports/importers/index.ts` → `detectSource` |
| Parsing e delimitatore | `lib/csv/parse.ts` |
| Mapping colonne (alias IT/EN) | `lib/imports/importers/mapping.ts` |
| Normalizzazione (`NormalizedTransaction`) | `INGImporter`, `RevolutImporter`, `TradeRepublicImporter` (interfaccia `CsvImporter`) |
| Duplicati | `lib/imports/fingerprint.ts`, `lib/imports/duplicates.ts` |
| Classificazione (regole configurabili) | `lib/categorization/engine.ts`, `rules.ts` + `categorization_rules` |
| Trasferimenti | `lib/transfers/detect.ts` |
| Anteprima, correzioni, conferma | `server/services/imports.ts`, `/imports/[id]` |

Scelte principali:
- **Nessuna scrittura durante il parsing**: l'anteprima salva solo `imports`,
  `import_files` e `import_rows`; le transazioni nascono alla conferma.
- **File originale** nel bucket privato `imports/{uid}/{import_id}/{sha256}.csv`,
  mai modificato; `import_rows.raw` conserva ogni riga originale.
- **Una riga CSV = una `import_row`**. Commissioni e imposte della stessa riga
  diventano movimenti di cassa separati alla conferma (fingerprint derivato),
  così i saldi restano corretti.
- **Classificazione**: suggerimento strutturale della fonte (es. Revolut
  `TOPUP`, Trade Republic `BUY`), poi la prima regola applicabile — regole
  dell'utente nel database prima delle predefinite (dati, non codice). Mai un
  tipo incompatibile con il segno. Confidenza < 0,6 o nessun tipo → **Da
  verificare**: la conferma è bloccata finché l'utente non classifica o esclude.
- **Trade Republic**: `BUY`/`SELL`/PAC vanno in `investment_transactions` (non
  sono spese né movimenti di cassa); versamenti e prelievi sono trasferimenti;
  dividendi e interessi entrate con natura investimento; il saldo del conto
  broker resta "liquidità al costo" fino allo Sprint 8 (valore di mercato).
- **Revolut**: righe REVERTED/DECLINED/PENDING, prodotti diversi dal conto
  corrente e valute diverse dalla valuta del conto vengono escluse con il motivo.
- **Conferma idempotente**: ogni inserimento usa `upsert … ignoreDuplicates` su
  `(account_id, fingerprint)`; un nuovo tentativo dopo un errore non duplica nulla.

## 8. Duplicati: fingerprint

Con identificativo della fonte (es. `transaction_id` di Trade Republic):
`sha256("ext" | fonte | id)`. Altrimenti:
`sha256(account_id | booked_on | amount_cents | normalizedDescription | n)`
dove `n` è l'indice di occorrenza della stessa quaterna *nello stesso file*.
Così due caffè identici nello stesso giorno restano due righe distinte
(n = 0, 1), mentre reimportare un CSV sovrapposto produce gli stessi
fingerprint e le righe vengono marcate come duplicate. Il match fuzzy
(stesso conto e importo, data ±2 giorni, descrizione simile) produce solo
`possible_duplicate`, mai un inserimento automatico.

## 9. Categorizzazione (multilivello)

1. **Regole** (`origin = system | user`): ordine per `priority`, primo match vince.
2. **Regole apprese** (`origin = learned`): create dalle correzioni manuali
   (pattern = descrizione normalizzata del merchant).
3. **AI** (Sprint 11+, opt-in in `profiles.ai_categorization_enabled`): solo per
   righe ancora non classificate; invia descrizione normalizzata e segno
   dell'importo, mai IBAN o nomi completi. Risultato sempre "suggerito".

Soglie: ≥ 0.90 applicata automaticamente (`is_categorized = true`);
0.60–0.89 proposta da confermare; < 0.60 nessuna proposta.

## 10. Rischi e decisioni aperte

- **Formati CSV reali**: le intestazioni di ING, Revolut e Trade Republic
  vanno verificate su export reali anonimizzati (solo intestazioni + 2 righe
  inventate) prima dello Sprint 3. Gli adapter avranno mapping configurabile,
  quindi un cambio di formato non richiede un deploy.
- **ING** esporta spesso XLS/XLSX oltre al CSV: supporto Excel valutato allo Sprint 3.
- **Valore Trade Republic**: nessuna API prezzi in v1; il valore si aggiorna da
  valutazione manuale o dall'export TR se contiene il controvalore.
