# Fixture CSV — DATI INVENTATI

Tutti i file in questa cartella sono **sintetici**: nomi, importi, ISIN di
esempio, identificativi e date sono inventati per sviluppo e test. Non sono
estratti conto reali e non devono mai essere sostituiti con export reali.

- `*/fixture-utente.csv`: i fixture forniti dal proprietario per lo Sprint 3.
- `*/completo.csv`: varianti estese che coprono i casi dei test (stipendio,
  spese, trasferimenti, rimborsi, commissioni, valute, PAC, dividendi…).
- `*/duplicati*.csv`: casi di deduplicazione.
- `*/formato-reale.csv`: **anonimizzati**, riproducono la struttura degli export
  reali (encoding, delimitatore, CRLF, NUL di riempimento in coda per ING,
  intestazioni, formati di data e importo, tipi, stati, righe di saldo,
  duplicati). Nomi, IBAN (`IT00…`), riferimenti e importi sono inventati.
  Non vanno riformattati: il riempimento NUL e i CRLF fanno parte del test.

Le intestazioni dei formati reali vanno confermate con export anonimizzati
prima di importare dati veri (vedi docs/05-roadmap.md).
