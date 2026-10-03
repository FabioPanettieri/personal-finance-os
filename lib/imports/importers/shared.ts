import { ZERO, type Cents } from '../../money'
import type { BalanceMarker, NormalizedTransaction, RowOutcome } from '../types'

/** Valori predefiniti di una transazione normalizzata (per comporre gli importer). */
export function baseTransaction(
  fields: Pick<NormalizedTransaction, 'source' | 'rowIndex' | 'bookedOn' | 'description' | 'originalDescription' | 'amount' | 'currency' | 'raw'> &
    Partial<NormalizedTransaction>,
): NormalizedTransaction {
  return {
    valueOn: null,
    occurredAt: null,
    originalAmount: null,
    originalCurrency: null,
    externalId: null,
    sourceType: null,
    counterparty: null,
    counterpartyIban: null,
    fee: ZERO,
    tax: ZERO,
    movement: 'cash',
    investment: null,
    secondary: [],
    hint: null,
    reportedBalance: null,
    warnings: [],
    ...fields,
  }
}

export function invalid(rowIndex: number, raw: Record<string, string>, errors: string[]): RowOutcome {
  return { kind: 'invalid', rowIndex, errors, raw }
}

export function skipped(rowIndex: number, raw: Record<string, string>, reason: string, balance?: BalanceMarker): RowOutcome {
  return balance ? { kind: 'skipped', rowIndex, reason, raw, balance } : { kind: 'skipped', rowIndex, reason, raw }
}

/** IBAN in forma compatta (senza spazi, maiuscolo), o null se non plausibile. */
export function normalizeIban(text: string | null | undefined): string | null {
  const compact = (text ?? '').replace(/\s+/g, '').toUpperCase()
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(compact) ? compact : null
}

export const abs = (value: Cents): Cents => (value < 0 ? (-value as Cents) : value)
