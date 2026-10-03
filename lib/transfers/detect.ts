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
  /** Conto proprio di destinazione già noto (IBAN o regola): limita la ricerca a quel conto. */
  targetAccountId?: string | null
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

export type TransferResult = TransferMatch | { ambiguous: true } | null

function dayDistance(a: IsoDate, b: IsoDate): number {
  return Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000
}

/**
 * Cerca la gamba opposta di un trasferimento tra conti propri: importo
 * opposto, entro ±3 giorni, controparte già classificata come trasferimento
 * o investimento e non ancora collegata. Ogni controparte si usa una volta sola.
 *
 * Abbinamento uno-a-uno deterministico: le righe si elaborano in ordine di
 * data (poi di file) e ciascuna prende la controparte libera più vicina in
 * data (a parità: la più vecchia, poi per id). Così due -50 e due +50 sullo
 * stesso conto si abbinano in ordine invece di risultare "ambigue".
 *
 * Restano ambigue (mai collegate automaticamente) le righe con candidati su
 * conti DIVERSI: lì non c'è un criterio oggettivo per scegliere, salvo che il
 * conto di destinazione sia già noto (IBAN o regola), che filtra i candidati.
 */
export function detectTransfers(rows: readonly TransferRow[], accountKind: AccountKind, counterparts: readonly Counterpart[]): TransferResult[] {
  const used = new Set<string>()
  const results: TransferResult[] = rows.map(() => null)
  const order = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareIsoDates(a.row.bookedOn, b.row.bookedOn) || a.index - b.index)

  for (const { row, index } of order) {
    if (!row.eligible || row.movement !== 'cash') continue
    if (row.type && !['transfer', 'investment'].includes(row.type) && row.confidence >= 0.8) continue

    const from = addDays(row.bookedOn, -TRANSFER_WINDOW_DAYS)
    const to = addDays(row.bookedOn, TRANSFER_WINDOW_DAYS)
    const matches = counterparts.filter(
      (c) =>
        !used.has(c.id) &&
        c.amount === -row.amount &&
        ['transfer', 'investment'].includes(c.type) &&
        (!row.targetAccountId || c.accountId === row.targetAccountId) &&
        compareIsoDates(c.bookedOn, from) >= 0 &&
        compareIsoDates(c.bookedOn, to) <= 0,
    )
    if (matches.length === 0) continue
    if (new Set(matches.map((c) => c.accountId)).size > 1) {
      results[index] = { ambiguous: true }
      continue
    }

    const counterpart = [...matches].sort(
      (a, b) =>
        dayDistance(a.bookedOn, row.bookedOn) - dayDistance(b.bookedOn, row.bookedOn) ||
        compareIsoDates(a.bookedOn, b.bookedOn) ||
        a.id.localeCompare(b.id),
    )[0]!
    used.add(counterpart.id)
    const liquidToInvestment = accountKind !== 'investment' && counterpart.accountKind === 'investment' && row.amount < 0
    results[index] = {
      counterpart,
      type: liquidToInvestment ? 'investment' : 'transfer',
      confidence: 0.92,
      reason: `${row.amount < 0 ? 'Verso' : 'Da'} ${counterpart.accountName} (${counterpart.bookedOn})`,
    }
  }
  return results
}
