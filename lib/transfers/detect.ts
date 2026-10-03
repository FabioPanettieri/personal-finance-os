import { addDays, compareIsoDates, type IsoDate } from '../dates'
import type { AccountKind } from '../accounts'

export const TRANSFER_WINDOW_DAYS = 3

export type TransferRow = {
  bookedOn: IsoDate
  amount: number
  type: string | null
  confidence: number
  movement: 'cash' | 'trade'
  eligible: boolean
}

export type Counterpart = {
  id: string
  accountId: string
  accountName: string
  accountKind: AccountKind
  bookedOn: IsoDate
  amount: number
  type: string
}

export type TransferMatch = {
  counterpart: Counterpart
  /** investment se il denaro va da un conto liquido a un conto investimento. */
  type: 'transfer' | 'investment'
  confidence: number
  reason: string
}

/**
 * Cerca la gamba opposta di un trasferimento tra conti propri: importo
 * opposto, entro ±3 giorni, controparte già classificata come trasferimento
 * o investimento e non ancora collegata. Si accetta solo una corrispondenza
 * univoca; ogni controparte si usa una volta sola.
 */
export function detectTransfers(rows: readonly TransferRow[], accountKind: AccountKind, counterparts: readonly Counterpart[]) {
  const used = new Set<string>()
  return rows.map((row): TransferMatch | { ambiguous: true } | null => {
    if (!row.eligible || row.movement !== 'cash') return null
    if (row.type && !['transfer', 'investment'].includes(row.type) && row.confidence >= 0.8) return null

    const from = addDays(row.bookedOn, -TRANSFER_WINDOW_DAYS)
    const to = addDays(row.bookedOn, TRANSFER_WINDOW_DAYS)
    const matches = counterparts.filter(
      (c) =>
        !used.has(c.id) &&
        c.amount === -row.amount &&
        ['transfer', 'investment'].includes(c.type) &&
        compareIsoDates(c.bookedOn, from) >= 0 &&
        compareIsoDates(c.bookedOn, to) <= 0,
    )
    if (matches.length === 0) return null
    if (matches.length > 1) return { ambiguous: true }

    const counterpart = matches[0]!
    used.add(counterpart.id)
    const liquidToInvestment = accountKind !== 'investment' && counterpart.accountKind === 'investment' && row.amount < 0
    const type = liquidToInvestment ? 'investment' : 'transfer'
    return {
      counterpart,
      type,
      confidence: 0.92,
      reason: `${row.amount < 0 ? 'Verso' : 'Da'} ${counterpart.accountName} (${counterpart.bookedOn})`,
    }
  })
}
