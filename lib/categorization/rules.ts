import type { ImportSource, TransactionNature, TransactionType } from '../imports/types'

/**
 * Regola di classificazione. Le regole sono DATI: vivono in
 * `categorization_rules` (per utente, RLS + AAL2), ordinate per priorità,
 * versionate e modificabili senza deploy. Le regole iniziali sono create dal
 * database alla registrazione (migration 0006), non scritte nel codice.
 * I riferimenti per percorso/nome (setCategoryPath…) servono solo a regole
 * costruite in memoria (test); quelle del database usano gli id.
 */
export type Rule = {
  id: string
  /** id in categorization_rules; null per regole costruite in memoria. */
  dbId: string | null
  name: string
  priority: number
  /** Campo confrontato: descrizione, controparte, IBAN controparte o tipo/causale della banca. */
  matchField: 'description' | 'counterparty' | 'counterparty_iban' | 'source_type'
  matchType: 'contains' | 'equals' | 'starts_with' | 'regex'
  pattern: string
  accountId: string | null
  direction: 'in' | 'out' | 'any'
  amountMinCents: number | null
  amountMaxCents: number | null
  /** Limita la regola ad alcune fonti (null/assente = tutte). */
  sources?: readonly ImportSource[] | null
  setType: TransactionType | null
  setNature: TransactionNature | null
  setCategoryId?: string | null
  setCategoryPath?: string
  setBusinessId?: string | null
  setBusinessSlug?: string
  setIncomeSourceId?: string | null
  setIncomeSourceName?: string
  /** Conto proprio di destinazione per i trasferimenti (es. Carta di credito). */
  setTransferAccountId?: string | null
  confidence: number
  /** Riconosce il caso ma chiede revisione esplicita (nessun tipo assegnato). */
  review?: string | null
}
