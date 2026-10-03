# Import — validazione sui formati reali (Sprint 3 Hardening)

Lavoro fatto confrontando gli importer con **tre estratti reali** dell'utente
(Revolut CSV, ING CSV, Trade Republic PDF). I file reali sono stati letti solo
in locale, fuori dal repository, e non sono mai stati importati nel database
di sviluppo. I test usano **fixture anonimizzate** che ne riproducono la
struttura (`tests/fixtures/csv/*/formato-reale.csv`): nomi, IBAN, riferimenti
e importi sono inventati.

## Formati osservati

### Revolut (export italiano)

| Aspetto | Valore reale | Gestione |
|---|---|---|
| Encoding / fine riga | UTF-8 senza BOM, LF | invariato |
| Delimitatore | `,` | invariato |
| Intestazione | `Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo` | alias IT; riconoscimento ≥ 0,95 (era 0,53, sotto soglia) |
| Prodotto | `Attuale` | = conto corrente (prima: tutte le righe escluse) |
| Stato | `COMPLETATO` | stati IT/EN normalizzati (STORNATO, RIFIUTATO, IN SOSPESO… esclusi); stato ignoto → avviso |
| Tipi | `Pagamento con carta`, `Ricarica`, `Pagamento`, `CARD_CREDIT` | mappati alla forma canonica; `sourceType` conserva il testo della banca |
| Date | `YYYY-MM-DD HH:MM:SS` senza fuso | **data della transazione = data di completamento**; la data di inizio resta in `raw` |
| Importi | punto decimale, `-` per le uscite | centesimi interi |

**Ricarica ≠ trasferimento.** Nel file reale le ricariche sono sia dal conto
ING dell'utente sia incassi da terzi (Etsy, Stripe, Google, Mangopay, PayPal,
privati). Una ricarica resta "Da verificare" finché non la decide:
1. una regola del database (Etsy/Stripe → VOXEL, Google Ireland → YouTube…);
2. l'abbinamento con un'uscita già importata su un altro conto proprio
   (stesso importo opposto, ±3 giorni) → trasferimento;
3. l'utente.

### ING (CSV)

| Aspetto | Valore reale | Gestione |
|---|---|---|
| Encoding / fine riga | UTF-8 senza BOM, **CRLF** | invariato |
| Riempimento | **byte NUL in coda** fino a 4096 byte | ignorati (`stripTrailingNul`); un NUL nel testo resta "binario" |
| Delimitatore | `;` | invariato |
| Intestazione | `DATA CONTABILE;DATA VALUTA;USCITE;ENTRATE;CAUSALE;DESCRIZIONE OPERAZIONE` | alias |
| Importi | `-1.565,00` / `+1.672,00` (colonne separate) | centesimi interi |
| Righe di saldo | `Saldo iniziale` / `Saldo finale` (causale vuota) | **mai transazioni**: righe escluse con il saldo dichiarato |
| Causale | `Bonifico In Uscita`, `Giroconto`, `Addebito Carta Di Credito`, `Accredito Stipendio/Pensione` | `sourceType`, usabile dalle regole |
| Descrizione | numero d'ordine, IBAN e nome della controparte, nota libera | estratti `counterparty` e `counterpartyIban` |

**Riconciliazione**: se il file dichiara saldo iniziale e finale, l'anteprima
verifica `saldo iniziale + movimenti = saldo finale`. L'esito compare sulla
riga del saldo finale; se non torna, è salvato anche in `imports.error_message`.

### Trade Republic (PDF) — solo documentazione, nessun parser

Vedi la sezione dedicata più sotto.

## Decisioni confermate dall'utente

- **A — ING Conto Risparmio**: nuovo conto reale (tipo `savings`, rinominabile)
  creato per ogni utente. ING principale ↔ Risparmio = trasferimento; il conto
  concorre al patrimonio.
- **B — Carta di credito**: conto separato (tipo `card`). L'"Addebito Carta Di
  Credito" su ING è un movimento verso la carta, non una spesa finale. Senza
  l'estratto della carta, il conto Carta riceve la contropartita (saldo
  positivo = debito saldato): le singole spese della carta non sono note.
- **C — Regole nel database**: tutte le regole (anche quelle generiche, prima
  nel codice) sono righe di `categorization_rules`: ordinate per priorità,
  modificabili senza deploy, versionate, protette da RLS + AAL2. Regole
  personali iniziali: Etsy, Stripe → VOXEL Studio vendite; Google Ireland →
  YouTube; Packlink → spedizioni; Elegoo → materiali; Aruba, GoDaddy →
  servizi/software. **Mangopay: nessuna regola** (resta da verificare).
- **D — Data**: data di completamento come data della transazione.
- **E — Trade Republic PDF**: nessun parser ora.

## Trasferimenti tra conti propri

1. **IBAN della controparte = IBAN di un altro conto dell'utente**
   (`accounts.iban`, facoltativo, dal form del conto) → trasferimento certo
   (confidenza 0,95) con il conto di destinazione.
2. **Regola con conto di destinazione** (`set_transfer_account_id`, es. causale
   "Addebito Carta Di Credito" → Carta di credito).
3. **Abbinamento con la gamba opposta già importata**, uno-a-uno e
   deterministico: righe in ordine di data, a ciascuna la controparte libera più
   vicina in data (poi la più vecchia, poi per id). Due -50 e due +50 lo stesso
   giorno si abbinano in ordine invece di risultare "ambigui". Resta ambiguo
   (nessun collegamento) solo un candidato su **conti diversi**, a meno che il
   conto di destinazione sia già noto.

Il conto di destinazione è salvato in `import_rows.transfer_account_id` ed è
modificabile nell'anteprima ("Conto di destinazione"). Alla conferma:
- destinazione **alimentata da estratti** (ING, Revolut, Trade Republic): nessuna
  contropartita inventata; il collegamento avviene ora (se la gamba opposta
  esiste) o al prossimo import di quel conto;
- destinazione **non alimentata da estratti** (Conto Risparmio, Carta di
  credito): la contropartita viene creata nello stesso `transfer_group`
  (fingerprint derivato `sha256(fingerprint | mirror)`, idempotente).

## Precisione degli importi

- Importi sempre in centesimi interi; nessuna aritmetica in virgola mobile
  (`parseAmount` lavora sulle cifre, arrotondamento sul carattere).
- Quantità e prezzi degli strumenti restano **stringhe decimali** fino a
  Postgres (`numeric`): prima venivano convertiti con `Number()`.

## Trade Republic PDF — architettura futura

Stato: **da progettare**, nessun codice. Il CSV di Trade Republic resta il
formato supportato.

Osservato sull'estratto reale (PDF 2.0 di 2 pagine, testo estraibile, font con
mappa Unicode):
- sezioni `ESTRATTO CONTO RIASSUNTIVO`, `TRANSAZIONI SUL CONTO`,
  `PANORAMICA DEL SALDO al <data>`, `NOTE SULL'ESTRATTO CONTO`;
- righe con data `DD mmm YYYY` (mesi italiani abbreviati), tipo (`Interessi`,
  `Rendimento`…), descrizione, un importo in entrata **o** in uscita, saldo;
- importi `0,04 €`; nessun identificativo di transazione;
- la panoramica (conti fiduciari, fondi del mercato monetario) **non** sono
  movimenti.

Progetto di `TradeRepublicPdfImporter`:
1. estrazione del testo con posizioni (libreria JS pura, eseguibile su Vercel;
   **non** `pdftotext`, binario di sistema assente in produzione);
2. individuazione delle colonne dall'intestazione della tabella transazioni,
   parser posizionale riga per riga, gestione di descrizioni su più righe e
   tabelle su più pagine (piè di pagina "Pagina N da M" ignorato);
3. segno dell'importo ricavato dalla **variazione del saldo**, non dalla colonna;
4. riconciliazione obbligatoria con il riepilogo (saldo iniziale + entrate −
   uscite = saldo finale) e con il saldo progressivo: **import rifiutato** se i
   conti non tornano;
5. fingerprint con indice di occorrenza (nessun id della fonte);
6. stesso `NormalizedTransaction` e stessa pipeline dei CSV.

Prerequisiti prima di scriverlo: più campioni reali (versamenti, acquisti,
vendite, carta, descrizioni lunghe, più pagine) e la scelta della libreria di
estrazione. `TODO(TradeRepublicPdfImporter)` in
`lib/imports/importers/trade-republic.ts`.

## Limiti residui

- Un solo campione per fonte: altre causali ING o tipi Revolut (cambi valuta,
  commissioni reali, prelievi) non sono stati osservati e restano "Da verificare".
- Il formato reale della colonna `Costo` di Revolut con commissioni ≠ 0 non è
  osservabile nel campione.
- Senza l'estratto della carta di credito le singole spese della carta non
  esistono nell'app: il conto Carta mostra solo gli addebiti mensili.
- Le ricariche Revolut dall'utente si riconoscono come trasferimenti solo se
  l'uscita ING è già importata (o con una regola personale, es. sul proprio nome).
- Gestione delle regole dall'interfaccia: non ancora. Oggi si modificano a
  database (sempre con RLS/AAL2); l'interfaccia è rimandata a uno sprint successivo.
