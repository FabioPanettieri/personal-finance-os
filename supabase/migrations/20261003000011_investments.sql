-- =============================================================================
-- Personal Finance OS — 0011 investimenti (Sprint 8)
--
-- Nessuna API di prezzi: il valore di mercato arriva dalle valutazioni che
-- l'utente inserisce. Con il prezzo unitario la valutazione resta valida anche
-- dopo nuovi acquisti (valore = quantità attuale × ultimo prezzo); il valore di
-- mercato salvato è la fotografia al momento dell'inserimento.
--
-- Principio: versamento ≠ rendimento. Il rendimento è
--   (liquidità nel broker + titoli a valore di mercato) − versato netto,
-- quindi un nuovo versamento aumenta versato e valore della stessa cifra.
-- =============================================================================

alter table public.investment_valuations
  add column unit_price numeric(20, 8) check (unit_price > 0);

comment on column public.investment_valuations.unit_price is
  'Prezzo unitario dello strumento alla data (inserito a mano). Null per valutazioni del conto intero.';
