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

## SECURITY HARDENING — COMPLETED (tra Sprint 2 e Sprint 3)

- Migration `20261003000005_enforce_aal2.sql`: policy restrictive AAL2 su 25
  tabelle con dati utente e sul bucket `imports`; migration 0001–0004 invariate
- Test: suite SQL 117 (simulazione JWT, su Postgres temporaneo e su Supabase
  locale), integrazione API 36 con sessioni reali AAL1/AAL2, test di copertura
  per le tabelle future; controprova senza migration: i test AAL1 falliscono
- Login, configurazione e verifica TOTP, logout, sessione persistente e conti
  verificati in E2E sullo stack reale

## SPRINT 3 — COMPLETED (solo fixture sintetiche)

**Implemented**
- Pipeline: validazione file → riconoscimento fonte → parsing → mapping →
  normalizzazione → duplicati → classificazione → trasferimenti → anteprima →
  conferma → scrittura. Nessuna scrittura durante il parsing.
- Importer specifici con interfaccia comune `CsvImporter` e modello
  `NormalizedTransaction`: `INGImporter`, `RevolutImporter`, `TradeRepublicImporter`.
- Classificazione con regole configurabili (DB + pacchetto predefinito come
  dati), "Da verificare" quando nulla è abbastanza sicuro.
- Deduplicazione: `transaction_id` della fonte quando presente, altrimenti
  fingerprint con indice di occorrenza; possibili duplicati da confermare.
- Rilevamento e collegamento dei trasferimenti (ING ↔ Revolut, Revolut → Trade Republic).
- UI: storico, nuova importazione, anteprima con filtri, correzione, esclusione, conferma.
- File originali nello Storage privato collegati a import / import_files / import_rows.

**Database**: nessuna migration; schema Sprint 0 + 0005 (AAL2) invariato.

**Tests**: unit 196, SQL 124 (Postgres temporaneo e Supabase locale),
integrazione API 53, E2E mock 24, E2E Supabase reale 19 (1 saltato per scelta).

**Prima dei dati reali**: confermare le intestazioni e la semantica di
fee/tax/amount con export reali anonimizzati (solo intestazioni + righe inventate).

## SPRINT 3 HARDENING — COMPLETED (validazione su formati reali)

Dettagli: `docs/06-import-real-formats.md`.

**Implemented**
- Revolut export italiano: `Prodotto = Attuale`, tipi e stati in italiano,
  data di completamento, riconoscimento formato più forte, Ricarica mai
  trasferimento automatico, controparte dalla descrizione.
- ING reale: NUL di riempimento, CRLF, `;`, righe Saldo iniziale/finale mai
  transazioni, riconciliazione, causale come tipo della banca, controparte e IBAN.
- Trasferimenti: IBAN dei conti propri, conto di destinazione (anteprima e
  regole), abbinamento uno-a-uno deterministico, contropartite su conti non
  alimentati da estratti.
- Conti "ING Conto Risparmio" e "Carta di credito".
- Regole di classificazione solo nel database (versionate, RLS/AAL2), incluse
  le regole personali iniziali; nessuna regola Mangopay.
- Quantità e prezzi come stringhe decimali fino a Postgres.
- UI minima: IBAN nel form del conto, "Conto di destinazione" nell'anteprima.

**Database**: migration 0006 (estensione minima, nessuna nuova tabella).

**Non fatto (deciso)**: parser PDF Trade Republic — solo architettura e TODO.

## SPRINT 4 — COMPLETED (Financial Dashboard)

Su richiesta, lo Sprint 4 è diventato la dashboard (anticipando parte dello
Sprint 6 della tabella); l'explorer completo delle transazioni (modifica, bulk)
resta da fare. Dettagli: `docs/07-dashboard.md`.

**Implemented**
- `/`: patrimonio netto, liquidità, entrate, uscite, cash flow; selettore di
  periodo (8 preset, personalizzato) con confronto neutro; grafico del
  patrimonio (30g/90g/6m/1a/tutto); cash flow mensile cliccabile; spese per
  categoria; fonti di reddito; attività (ricavi, spese, utile, margine);
  conti; attività recenti; "Da verificare"; ultimo import.
- `/transactions`: lista con filtri nell'URL (periodo, tipo, conto, categoria,
  business, fonte, da verificare, ricerca), paginata.
- `/transactions/[id]`: dettaglio (IBAN controparte mascherato, gambe del
  trasferimento, origine) e conferma della classificazione.
- Token colore dei grafici validati per daltonismo in light e dark.

**Database**: migration 0007 (solo funzioni SECURITY INVOKER, nessuna tabella).

## REDESIGN + ACCESSO PRIVATO — COMPLETED (dopo lo Sprint 4)

Su richiesta: app più chiara e accattivante, solo su PC e telefono.

**Implemented**
- Tema scuro premium di default, colori delle banche (Revolut viola, ING
  arancione, Trade Republic blu), navigazione a 5 voci (docs/03-design-system.md).
- Home: saluto, patrimonio con andamento a 6 mesi, "Questo mese" (entrate,
  uscite, ti restano), da sistemare, carte dei conti, dove vanno i soldi,
  ultimi movimenti.
- Movimenti: ricerca, filtri rapidi (da sistemare, per conto), raggruppati per giorno.
- Dettaglio movimento: "Sistema" con scelte rapide e regola ricordata
  (`classifyTransaction`, regole `origin = 'learned'`).
- Conti, Importa (3 passi, carte delle banche), nuova pagina Business.
- Rimosse le pagine segnaposto (Analisi, Report, Obiettivi, Investimenti, Patrimonio).
- Accesso privato: Next.js solo su `127.0.0.1`, telefono via `tailscale serve`,
  `Avvia Finanze.cmd`, regola firewall per le porte del database, PWA
  installabile (docs/accesso-privato.md).

**Database**: nessuna migration.

## SPRINT 5 — COMPLETED (Transfers)

Il rilevamento automatico durante l'import esisteva dallo Sprint 3 Hardening
(`lib/transfers/detect.ts`, metà speculari per conto deposito e carta). Lo
Sprint 5 aggiunge integrità e controllo manuale.

**Implemented**
- Migration 0008: vincolo "due metà opposte su conti diversi" nel database,
  `link_transfer` / `unlink_transfer` atomiche (SECURITY INVOKER).
- Dettaglio movimento: "È l'altra metà?" con i candidati (importo opposto,
  altro conto, ±7 giorni, prima quelli già trasferimenti) e pulsante Collega;
  "scollega" per le coppie sbagliate. Anche un'entrata/spesa può essere
  collegata se in realtà era un giroconto.
- "Verso i miei conti" / "Dai miei conti" collega da solo se c'è un solo
  candidato già riconosciuto come trasferimento; riclassificare una metà come
  entrata o spesa scioglie il trasferimento.
- Movimenti: filtro "Da abbinare" (trasferimenti senza l'altra metà).
- Verso un conto di investimento il collegamento diventa "versamento".

**Acceptance**: test di integrazione ING ↔ Revolut ↔ Trade Republic — il
patrimonio resta identico prima e dopo ogni collegamento/scollegamento, le
entrate scendono quando una ricarica viene riconosciuta come giroconto.

**Database**: migration 0008 (vincoli + 2 funzioni, nessuna tabella).


## SPRINT 6 — COMPLETED (Explorer dei movimenti)

La dashboard prevista dallo Sprint 6 era già stata anticipata nello Sprint 4
(hero patrimonio, KPI, spese per categoria, entrate per fonte in Business,
numeri verificati dai test). Lo Sprint 6 completa quindi l'explorer rimasto
dallo Sprint 4 originale.

**Implemented**
- Movimenti: "Seleziona" → selezione multipla (o tutti i risultati dei
  filtri, max 1000) → Conferma o "Classifica come…" con le scelte rapide; le
  scelte da uscita non toccano le entrate selezionate (e viceversa).
- Pannello "Filtri e ordinamento": periodo, tipo, categoria, business,
  ordinamento (più recenti, spese più grandi, entrate più grandi); tutto nell'URL.
- Dettaglio movimento: modifica di descrizione, categoria e sottocategoria
  (solo del tipo giusto), business, fonte di reddito e note.
- Migration 0009: `bulk_confirm_transactions` e `bulk_classify_transactions`
  (SECURITY INVOKER, array nel corpo, max 1000; un trasferimento riclassificato
  esce dal suo gruppo).

**Acceptance**: filtri via URL; modifica di gruppo su 500 movimenti in un
colpo (test di integrazione, < 5 s sullo stack locale).

**Database**: migration 0009 (2 funzioni, nessuna tabella).


## SPRINT 7 — COMPLETED (Business)

**Implemented**
- Regola unica nel database (migration 0010): un'entrata/spesa/rimborso è
  business se e solo se ha un business; la natura si allinea da sola
  (trigger) e i dati esistenti sono stati riallineati.
- `/business`: "Personale e business" affiancati (entrate, uscite, ti
  restano / utile) con il totale = somma dei due; card delle attività con link
  al dettaglio.
- `/business/[id]`: utile e margine del periodo, grafico incassi/spese degli
  ultimi 12 mesi (colori validati per daltonismo, dettaglio del mese al tocco,
  tabella dati), spese per categoria, movimenti del periodo.
- Funzioni SQL `personal_business_split`, `business_monthly`,
  `business_category_spending` (SECURITY INVOKER).

**Acceptance**: nessuna doppia conta — test SQL e di integrazione: personale +
business = entrate e uscite della dashboard; assegnare o togliere un business
sposta l'importo tra i due gruppi senza cambiare il totale.

**Database**: migration 0010 (1 trigger, 3 funzioni, riallineamento dati).


## SPRINT 8 — COMPLETED (Investimenti)

**Implemented**
- `/investments` (da Conti e dalla Home; la voce Conti resta evidenziata):
  valore attuale, rendimento (€ e %), versato netto, titoli, liquidità,
  dividendi e interessi, per ogni conto di investimento (Trade Republic).
- Posizioni a costo medio ponderato: quote, costo medio, valore, guadagno non
  realizzato; guadagno realizzato sulle vendite.
- Prezzo di oggi inserito a mano (nessuna API di prezzi): valore = quote ×
  ultimo prezzo; senza prezzo i titoli valgono al costo e la pagina lo dice.
- Piani di accumulo: aggiungi, metti in pausa, elimina; prossima esecuzione e
  totale investito al mese.
- Migration 0011: `investment_valuations.unit_price`.

**Acceptance**: versamento ≠ rendimento — rendimento = (liquidità + titoli a
valore di mercato) − versato netto; test unitari e di integrazione: un nuovo
versamento aumenta valore e versato della stessa cifra, il rendimento non cambia.

**Database**: migration 0011 (1 colonna).


## SPRINT 9 — COMPLETED (Report)

**Implemented**
- `/reports` (dalla Home, card "Report del mese"; resta evidenziata la Home):
  settimana (lunedì–domenica), mese, anno, con frecce per i periodi precedenti.
- "In breve": osservazioni generate solo dai numeri (risparmio e quota delle
  entrate, uscite/entrate in aumento o calo ≥ 10% rispetto al periodo
  precedente, categoria cresciuta/scesa di più ≥ 20 €, voce più pesante,
  spesa più grande, variazione del patrimonio, movimenti da sistemare).
  Nessun confronto con periodi vuoti, nessun "in calo" su un periodo in corso.
- Mese: confronto con il mese precedente e con lo stesso mese dell'anno prima.
- Anno: grafico mese per mese, confronto con l'anno precedente (entrate,
  uscite, risparmio, quota risparmiata, patrimonio a fine anno), storico del
  patrimonio a fine anno.
- Spese per categoria e "Personale e business" in ogni report.

**Acceptance**: insight solo da dati — test unitari (ogni frase riporta i
numeri da cui nasce, periodo vuoto = una sola frase senza numeri) e di
integrazione (stessi numeri della Home; somma dei mesi = totale dell'anno).

**Database**: nessuna migration (aggregati SQL esistenti).

**Da ricordare all'utente**: backup automatico del database locale (rimandato
su richiesta).
