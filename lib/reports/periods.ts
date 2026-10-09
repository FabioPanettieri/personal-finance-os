/**
 * Periodi dei report (Sprint 9): settimana (lunedì–domenica), mese, anno.
 * Il periodo precedente ha la stessa forma; il mese si confronta anche con lo
 * stesso mese dell'anno prima. Un periodo nel futuro non esiste: si torna a oggi.
 */
import { addDays, compareIsoDates, endOfMonth, isIsoDate, isoDateFromParts, isoDateParts, startOfMonth, type IsoDate } from '../dates'
import type { DateRange } from '../dashboard/period'

export const REPORT_KINDS = ['week', 'month', 'year'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const REPORT_KIND_LABELS: Record<ReportKind, string> = { week: 'Settimana', month: 'Mese', year: 'Anno' }

export type ReportPeriod = DateRange & {
  kind: ReportKind
  label: string
  /** Il periodo comprende oggi: i numeri sono parziali. */
  ongoing: boolean
  previous: DateRange & { label: string }
  /** Solo per il mese: lo stesso mese dell'anno precedente. */
  lastYear: (DateRange & { label: string }) | null
}

const MONTH = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const utc = (d: IsoDate) => new Date(`${d}T12:00:00Z`)

function monday(date: IsoDate): IsoDate {
  const weekday = (utc(date).getUTCDay() + 6) % 7
  return addDays(date, -weekday)
}

function weekRange(anchor: IsoDate): DateRange & { label: string } {
  const from = monday(anchor)
  const to = addDays(from, 6)
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const label = sameMonth
    ? `${isoDateParts(from).day}–${DAY_MONTH.format(utc(to))} ${isoDateParts(to).year}`
    : `${DAY_MONTH.format(utc(from))} – ${DAY_MONTH.format(utc(to))} ${isoDateParts(to).year}`
  return { from, to, label: `Settimana ${label}` }
}

function monthRange(anchor: IsoDate): DateRange & { label: string } {
  const from = startOfMonth(anchor)
  const label = MONTH.format(utc(from))
  return { from, to: endOfMonth(anchor), label: label.charAt(0).toUpperCase() + label.slice(1) }
}

function yearRange(year: number): DateRange & { label: string } {
  return { from: isoDateFromParts(year, 1, 1), to: isoDateFromParts(year, 12, 31), label: String(year) }
}

/** "2026-10-07" | "2026-10" | "2026" → data di riferimento; null se non valida. */
export function parseAnchor(value: string | null): IsoDate | null {
  if (!value) return null
  if (/^\d{4}$/.test(value)) return isoDateFromParts(Number(value), 1, 1)
  if (/^\d{4}-\d{2}$/.test(value) && isIsoDate(`${value}-01`)) return `${value}-01` as IsoDate
  return isIsoDate(value) ? value : null
}

export function resolveReportPeriod(input: { kind?: string | null; at?: string | null }, today: IsoDate): ReportPeriod {
  const kind: ReportKind = (REPORT_KINDS as readonly string[]).includes(input.kind ?? '') ? (input.kind as ReportKind) : 'month'
  let anchor = parseAnchor(input.at ?? null) ?? today
  if (compareIsoDates(anchor, today) > 0) anchor = today
  const { year } = isoDateParts(anchor)

  if (kind === 'week') {
    const r = weekRange(anchor)
    return { kind, ...r, ongoing: compareIsoDates(today, r.to) <= 0, previous: weekRange(addDays(r.from, -7)), lastYear: null }
  }
  if (kind === 'year') {
    const r = yearRange(year)
    return { kind, ...r, ongoing: compareIsoDates(today, r.to) <= 0, previous: yearRange(year - 1), lastYear: null }
  }
  const r = monthRange(anchor)
  const { month } = isoDateParts(anchor)
  return {
    kind,
    ...r,
    ongoing: compareIsoDates(today, r.to) <= 0,
    previous: monthRange(addDays(r.from, -1)),
    lastYear: monthRange(isoDateFromParts(year - 1, month, 1)),
  }
}

/** Parametro "at" per il periodo precedente/successivo (null se il successivo è nel futuro). */
export function shiftAnchor(period: ReportPeriod, direction: -1 | 1, today: IsoDate): string | null {
  const target = direction === -1 ? addDays(period.from, -1) : addDays(period.to, 1)
  if (direction === 1 && compareIsoDates(target, today) > 0) return null
  return period.kind === 'year' ? target.slice(0, 4) : period.kind === 'month' ? target.slice(0, 7) : target
}

/** Fine effettiva del periodo per i saldi: oggi se il periodo è in corso. */
export function effectiveEnd(range: DateRange, today: IsoDate): IsoDate {
  return compareIsoDates(range.to, today) > 0 ? today : range.to
}
