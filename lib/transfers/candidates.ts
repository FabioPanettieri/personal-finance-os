import { addDays, compareIsoDates, type IsoDate } from '../dates'

/** Finestra per l'abbinamento manuale: più larga di quella automatica (bonifici lenti, weekend). */
export const MANUAL_WINDOW_DAYS = 7

export type CandidateRow = {
  id: string
  accountId: string
  bookedOn: IsoDate
  amount: number
  currency: string
  type: string
  transferGroupId: string | null
}

function days(a: IsoDate, b: IsoDate): number {
  return Math.abs(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) - Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))) / 86_400_000
}

/** Intervallo di date in cui cercare l'altra metà. */
export function candidateWindow(bookedOn: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(bookedOn, -MANUAL_WINDOW_DAYS), to: addDays(bookedOn, MANUAL_WINDOW_DAYS) }
}

/**
 * Possibili "altre metà" di un movimento: importo opposto, stessa valuta,
 * conto diverso, non ancora collegate, entro ±7 giorni. Prima quelle già
 * classificate come trasferimento/investimento, poi per vicinanza di data.
 */
export function rankCandidates<T extends CandidateRow>(tx: CandidateRow, rows: readonly T[]): T[] {
  const { from, to } = candidateWindow(tx.bookedOn)
  const internal = (r: CandidateRow) => (r.type === 'transfer' || r.type === 'investment' ? 0 : 1)
  return rows
    .filter(
      (r) =>
        r.id !== tx.id &&
        r.accountId !== tx.accountId &&
        r.transferGroupId === null &&
        r.currency === tx.currency &&
        r.amount === -tx.amount &&
        compareIsoDates(r.bookedOn, from) >= 0 &&
        compareIsoDates(r.bookedOn, to) <= 0,
    )
    .sort((a, b) => internal(a) - internal(b) || days(a.bookedOn, tx.bookedOn) - days(b.bookedOn, tx.bookedOn) || a.id.localeCompare(b.id))
}
