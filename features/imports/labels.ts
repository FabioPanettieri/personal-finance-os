import type { ImportSource, TransactionType } from '@/lib/imports/types'

export const SOURCE_LABELS: Record<ImportSource, string> = {
  ing: 'ING Direct',
  revolut: 'Revolut',
  trade_republic: 'Trade Republic',
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Entrata',
  expense: 'Spesa',
  transfer: 'Trasferimento',
  investment: 'Investimento',
  refund: 'Rimborso',
}

/** Kind di categoria compatibile con un tipo di transazione. */
export function categoryKindFor(type: TransactionType): 'income' | 'expense' | 'transfer' | 'investment' {
  if (type === 'income') return 'income'
  if (type === 'transfer') return 'transfer'
  if (type === 'investment') return 'investment'
  return 'expense'
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'Nuova',
  duplicate: 'Duplicata',
  possible_duplicate: 'Possibile duplicato',
  invalid: 'Non valida',
  skipped: 'Esclusa',
  imported: 'Importata',
}

export const IMPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'In corso',
  preview: 'Da confermare',
  committed: 'Importata',
  failed: 'Non riuscita',
  cancelled: 'Annullata',
  rolled_back: 'Annullata dopo l’importazione',
}
