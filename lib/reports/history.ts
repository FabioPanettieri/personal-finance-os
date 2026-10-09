/** Storico del patrimonio per i report: valore a una data e valore a fine anno. */
import { compareIsoDates, isoDateFromParts, isoDateParts, type IsoDate } from '../dates'
import type { NetWorthPoint } from '../dashboard/metrics'

/** Patrimonio alla fine del giorno indicato; null se è prima del primo dato. */
export function balanceAt(history: readonly NetWorthPoint[], date: IsoDate): number | null {
  let value: number | null = null
  for (const p of [...history].sort((a, b) => compareIsoDates(a.date, b.date))) {
    if (compareIsoDates(p.date, date) > 0) break
    value = p.balance
  }
  return value
}

export type YearPoint = { year: number; value: number; change: number | null; ongoing: boolean }

/** Patrimonio a fine anno (o oggi per l'anno in corso), dal primo anno con dati. */
export function yearEndHistory(history: readonly NetWorthPoint[], today: IsoDate): YearPoint[] {
  if (history.length === 0) return []
  const first = [...history].sort((a, b) => compareIsoDates(a.date, b.date))[0]!.date
  const years: YearPoint[] = []
  for (let y = isoDateParts(first).year; y <= isoDateParts(today).year; y++) {
    const ongoing = y === isoDateParts(today).year
    const value = balanceAt(history, ongoing ? today : isoDateFromParts(y, 12, 31)) ?? 0
    const prev = years.at(-1)
    years.push({ year: y, value, change: prev ? value - prev.value : null, ongoing })
  }
  return years
}
