export const TYPE_LABELS = {
  income: 'Entrata',
  expense: 'Spesa',
  refund: 'Rimborso',
  transfer: 'Trasferimento',
  investment: 'Investimento',
} as const

export const NATURE_LABELS: Record<string, string> = {
  personal: 'Personale',
  business: 'Business',
  investment: 'Investimento',
  transfer: 'Movimento interno',
}

export const METHOD_LABELS: Record<string, string> = {
  none: 'Nessuna',
  rule: 'Regola',
  learned: 'Regola appresa',
  ai: 'Suggerimento AI',
  manual: 'Manuale',
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Inserimento manuale',
  csv_import: 'Importazione CSV',
  ing: 'ING',
  revolut: 'Revolut',
  trade_republic: 'Trade Republic',
  generic: 'Generico',
}
