# Dashboard finanziaria (Sprint 4)

La dashboard è una **vista** sui dati, non un secondo sistema contabile.
Nessun saldo manuale duplicato, nessuna metrica salvata: ogni numero si
ricalcola a ogni richiesta dalle transazioni e porta, con un clic, alla lista
dei movimenti che lo compongono.

```
accounts ─▶ transactions ─▶ classificazione (tipo, categoria, business, fonte, trasferimenti)
                         └▶ account_balances (vista)      ─┐
                         └▶ funzioni di aggregazione 0007 ─┴▶ lib/dashboard ─▶ /
```

## Dove sta cosa

| Parte | Modulo |
|---|---|
| Aggregati SQL (SECURITY INVOKER) | `supabase/migrations/20261003000007_dashboard_aggregates.sql` |
| Letture | `server/repositories/dashboard.ts`, `server/repositories/transactions.ts` |
| Composizione | `server/services/dashboard.ts` → `loadDashboard` |
| Logica pura (periodi, KPI, confronti) | `lib/dashboard/period.ts`, `lib/dashboard/metrics.ts` |
| Filtri URL della lista movimenti | `lib/transactions/filters.ts` |
| UI | `app/(app)/page.tsx`, `features/dashboard/components/*`, `/transactions`, `/transactions/[id]` |

## Formule

Tutti gli importi in centesimi interi, valuta base EUR (altre valute non si
sommano mai: la pagina lo segnala).

- **Patrimonio netto** = somma dei saldi di tutti i conti (`account_balances`,
  stessa finestra del saldo iniziale) = liquidità + investimenti al costo +
  carte + altro.
- **Liquidità** = conti liquidi (corrente, deposito, wallet, contanti) +
  liquidità sul broker. **La carta di credito è esclusa.**
- **Broker (Trade Republic)**: il saldo del conto comprende liquidità + titoli
  al costo, perché acquisti e vendite non sono movimenti di cassa. La parte
  investita (`acquisti − vendite`, da `investment_transactions`) passa dalla
  liquidità agli investimenti: il totale non cambia, niente doppi conteggi.
  **Il valore di mercato non è disponibile** e non viene stimato: la card lo dice.
- **Carta di credito**: saldo con segno. Negativo = debito. Positivo = addebiti
  mensili saldati da ING senza l'estratto della carta (le singole spese non
  esistono nei dati): mostrato a parte, mai come liquidità.
- **Entrate** = transazioni `income`.
- **Uscite** = `expense` al netto dei `refund`.
- **Cash flow netto** = entrate − uscite (separato dal patrimonio).
- **Esclusi da entrate/uscite**: `transfer` (ING ↔ Revolut, ING ↔ Conto
  Risparmio, ING → Carta) e `investment` (versamenti al broker). Le righe
  "Saldo iniziale/finale" degli estratti non sono mai transazioni (Sprint 3).
- **Business**: ricavi = `income` con quel business; spese = `expense − refund`
  con quel business; utile = ricavi − spese; margine = utile / ricavi, **N/D se
  i ricavi sono zero**. Una spesa personale (senza business) non entra mai.
- **Spese per categoria**: per macro-categoria (le sottocategorie confluiscono
  nel padre), con importo, quota sul totale positivo e numero di movimenti.
  Le categorie sono quelle del database.
- **Fonti di reddito**: da `income_sources`; entrate senza fonte a parte.

## Periodi e confronto

Preset: questo mese, mese scorso, ultimi 3 mesi, ultimi 6 mesi, anno corrente,
anno precedente, tutto, personalizzato (parametri URL `period`, `from`, `to`).
Il periodo vale per flussi, categorie, fonti, business, variazione dei conti e
barre del cash flow; **non** per i saldi attuali (patrimonio, liquidità, saldo
dei conti).

Confronto con il periodo precedente di pari durata (per i periodi in corso: lo
stesso tratto, es. 1–15 contro 1–15). La percentuale compare **solo** se il
periodo precedente è interamente coperto dai dati (primo movimento ≤ inizio del
periodo precedente) e il valore di riferimento è diverso da zero.

## Storico del patrimonio

`net_worth_history()` restituisce il patrimonio a fine giornata nei giorni con
movimenti (saldi iniziali + somma cumulativa, stessa logica di
`account_balances`). Nessuno snapshot salvato: con i volumi di un uso personale
il calcolo al volo è immediato, e non può andare fuori sincrono. Nessun punto
prima del primo dato. Intervalli del grafico: 30 giorni, 90 giorni, 6 mesi,
1 anno, tutto.

## "Da verificare"

- movimenti con classificazione proposta e non confermata
  (`is_categorized = false`) → `/transactions?status=review`, confermabili dal
  dettaglio;
- righe di importazioni ancora in anteprima che richiedono una decisione → `/imports`.

## Sicurezza e prestazioni

- Le funzioni di aggregazione sono `SECURITY INVOKER`, `STABLE`,
  `search_path = ''`: RLS e policy AAL2 si applicano come a una SELECT. Un
  utente AAL1 o un altro utente ottiene zero righe; `anon` non può eseguirle.
- Nessun `SELECT *` sulle transazioni: aggregati per gruppo, conteggi `head`,
  liste limitate (ultimi 10, pagine da 50). Le query usano gli indici esistenti
  `transactions(user_id, booked_on)` e `(account_id, booked_on)`.
- Il dettaglio mostra l'IBAN della controparte **mascherato** (`IT00 •••• 0003`),
  ricavato dalla riga originale dell'estratto.

## Limiti noti

- Nessun valore di mercato degli investimenti (Sprint 8): investimenti al costo.
- Spese della carta di credito non disponibili senza il suo estratto.
- `/transactions` è in sola lettura (filtri, ricerca, dettaglio, conferma):
  modifica della classificazione e azioni di massa arrivano con l'explorer.
- Una sola valuta aggregata (EUR).
