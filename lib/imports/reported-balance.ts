import type { IsoDate } from '../dates'

/**
 * Saldo dichiarato dalla banca riga per riga (Revolut: colonna "Saldo"/"Balance").
 * Serve ad allineare il saldo del conto a quello vero senza scriverlo a mano.
 *
 * Nello stesso giorno l'ordine delle righe non è affidabile (ING le elenca dalla più
 * recente, Revolut dalla più vecchia): l'ultima riga del giorno è quella dopo cui non ne
 * viene nessun'altra, cioè nessuna riga x ha saldo_x = saldo_r + movimento_x.
 */
export type ReportedRow = { bookedOn: IsoDate; amount: number; reportedBalance: number | null }

export function endOfDayBalance(rows: readonly ReportedRow[]): { date: IsoDate; balance: number } | null {
  const withBalance = rows.filter((r): r is ReportedRow & { reportedBalance: number } => r.reportedBalance !== null)
  if (withBalance.length === 0) return null
  const date = withBalance.reduce((max, r) => (r.bookedOn > max ? r.bookedOn : max), withBalance[0]!.bookedOn)
  const day = withBalance.filter((r) => r.bookedOn === date)
  const last = day.filter((r) => !day.some((x) => x !== r && x.reportedBalance === r.reportedBalance + x.amount))
  // Ambiguo (es. importi che si annullano): meglio non toccare il saldo.
  if (last.length !== 1) return null
  return { date, balance: last[0]!.reportedBalance }
}
