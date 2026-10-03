import { ZERO, type Cents } from '../../money'
import type { NormalizedTransaction, RowOutcome } from '../types'

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

export function skipped(rowIndex: number, raw: Record<string, string>, reason: string): RowOutcome {
  return { kind: 'skipped', rowIndex, reason, raw }
}

export const abs = (value: Cents): Cents => (value < 0 ? (-value as Cents) : value)
