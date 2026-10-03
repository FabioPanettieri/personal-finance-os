# Personal Finance OS

Applicazione privata per la gestione delle finanze personali: aggrega i
movimenti di ING Direct, Revolut e Trade Republic tramite import CSV e li
trasforma in una base dati storica per patrimonio, entrate, spese, business e
investimenti.

Stato: **Sprint 0 — Architecture** completato. Vedi [`docs/05-roadmap.md`](docs/05-roadmap.md).

## Documentazione

| Documento | Contenuto |
|---|---|
| [00 — Architecture](docs/00-architecture.md) | Stack, principi, definizioni finanziarie, struttura, route, componenti, data flow |
| [01 — Database](docs/01-database.md) | Schema, relazioni, convenzioni |
| [02 — Security](docs/02-security.md) | Modello di sicurezza, RLS, segreti, backup |
| [03 — Design System](docs/03-design-system.md) | Tipografia, colori, layout, grafici |
| [04 — Testing](docs/04-testing.md) | Strategia di test |
| [05 — Roadmap](docs/05-roadmap.md) | Sprint e report di avanzamento |

## Database

Migration in `supabase/migrations/`. Per testarle su un PostgreSQL locale
(senza Docker):

```bash
scripts/db-test-local.sh        # richiede PostgreSQL 15+ (initdb, pg_ctl, psql)
```

## Principi non negoziabili

- Importi in centesimi interi, mai float.
- I dati originali della banca non vengono mai sovrascritti.
- Trasferimenti tra conti propri non sono né entrate né spese.
- Nessuna credenziale bancaria, nessuno scraping: solo CSV.
- Ogni utente vede solo i propri dati (RLS verificata da test).
