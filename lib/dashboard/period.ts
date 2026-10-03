/**
 * Periodi della dashboard. Funzioni pure su date di calendario (IsoDate):
 * nessun Date locale, nessun effetto del fuso o dell'ora legale.
 */
import {
  addDays,
  compareIsoDates,
  daysInMonth,
  endOfMonth,
  isIsoDate,
  isoDateFromParts,
  isoDateParts,
  startOfMonth,
  type IsoDate,
} from '../dates'

export const PERIOD_PRESETS = ['this-month', 'last-month', '3m', '6m', 'ytd', 'last-year', 'all', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  'this-month': 'Questo mese',
  'last-month': 'Mese scorso',
  '3m': 'Ultimi 3 mesi',
  '6m': 'Ultimi 6 mesi',
  ytd: 'Anno corrente',
  'last-year': 'Anno precedente',
  all: 'Tutto',
  custom: 'Personalizzato',
}

export type DateRange = { from: IsoDate; to: IsoDate }

export type Period = DateRange & {
  preset: PeriodPreset
  label: string
  /** Periodo di confronto di pari durata; null quando non ha senso (Tutto). */
  previous: DateRange | null
  /** Etichetta del confronto ("vs mese precedente"). */
  previousLabel: string | null
}

/** Sposta di n mesi mantenendo il giorno, limitato all'ultimo giorno del mese. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = isoDateParts(date)
  const index = year * 12 + (month - 1) + months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  return isoDateFromParts(y, m, Math.min(day, daysInMonth(y, m)))
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = isoDateParts(from)
  const b = isoDateParts(to)
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000)
}

/** Il periodo immediatamente precedente, di pari numero di giorni. */
export function precedingRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to)
  const to = addDays(range.from, -1)
  return { from: addDays(to, -length), to }
}

export type PeriodInput = { period?: string | null; from?: string | null; to?: string | null }

/**
 * Risolve il periodo richiesto (parametri URL) rispetto a oggi.
 * - I periodi "in corso" (questo mese, ultimi N mesi, anno corrente) si
 *   confrontano con lo stesso tratto del periodo precedente (es. 1–15 del
 *   mese contro 1–15 del mese prima), mai con un periodo intero.
 * - "Tutto" parte dal primo dato disponibile: nessuna storia inventata.
 * - Parametri non validi → "Questo mese".
 */
export function resolvePeriod(input: PeriodInput, today: IsoDate, firstDataDate: IsoDate | null): Period {
  const preset = (PERIOD_PRESETS as readonly string[]).includes(input.period ?? '') ? (input.period as PeriodPreset) : 'this-month'
  const make = (from: IsoDate, to: IsoDate, previous: DateRange | null, previousLabel: string | null, p: PeriodPreset = preset): Period => ({
    preset: p,
    label: PERIOD_LABELS[p],
    from,
    to,
    previous,
    previousLabel,
  })
  const { year } = isoDateParts(today)

  switch (preset) {
    case 'last-month': {
      const from = startOfMonth(addMonths(today, -1))
      const prevFrom = startOfMonth(addMonths(today, -2))
      return make(from, endOfMonth(from), { from: prevFrom, to: endOfMonth(prevFrom) }, 'vs mese precedente')
    }
    case '3m':
    case '6m': {
      const months = preset === '3m' ? 3 : 6
      const from = startOfMonth(addMonths(today, -(months - 1)))
      return make(from, today, { from: addMonths(from, -months), to: addMonths(today, -months) }, `vs ${months} mesi precedenti`)
    }
    case 'ytd': {
      const from = isoDateFromParts(year, 1, 1)
      return make(from, today, { from: isoDateFromParts(year - 1, 1, 1), to: addMonths(today, -12) }, 'vs stesso periodo anno precedente')
    }
    case 'last-year': {
      return make(
        isoDateFromParts(year - 1, 1, 1),
        isoDateFromParts(year - 1, 12, 31),
        { from: isoDateFromParts(year - 2, 1, 1), to: isoDateFromParts(year - 2, 12, 31) },
        'vs anno precedente',
      )
    }
    case 'all':
      return make(firstDataDate && compareIsoDates(firstDataDate, today) <= 0 ? firstDataDate : today, today, null, null)
    case 'custom': {
      const from = input.from && isIsoDate(input.from) ? input.from : null
      const to = input.to && isIsoDate(input.to) ? input.to : null
      if (!from || !to || compareIsoDates(from, to) > 0 || daysBetween(from, to) > 366 * 20) {
        return resolvePeriod({ period: 'this-month' }, today, firstDataDate)
      }
      const range = { from, to }
      return make(from, to, precedingRange(range), 'vs periodo precedente')
    }
    case 'this-month':
    default: {
      const from = startOfMonth(today)
      return make(from, today, { from: startOfMonth(addMonths(today, -1)), to: addMonths(today, -1) }, 'vs stesso periodo mese precedente', 'this-month')
    }
  }
}

/** Query string del periodo (per i link che lo conservano). */
export function periodSearch(period: Pick<Period, 'preset' | 'from' | 'to'>): string {
  if (period.preset === 'custom') return `period=custom&from=${period.from}&to=${period.to}`
  return period.preset === 'this-month' ? '' : `period=${period.preset}`
}

/** Mesi (primo giorno) compresi nel periodo, per un grafico senza buchi. */
export function monthsInRange(range: DateRange): IsoDate[] {
  const months: IsoDate[] = []
  for (let m = startOfMonth(range.from); compareIsoDates(m, range.to) <= 0; m = addMonths(m, 1)) months.push(m)
  return months
}
