/**
 * Date di calendario senza fuso orario (docs/00-architecture.md §1).
 *
 * Una data contabile è una stringa `YYYY-MM-DD` (`IsoDate`). Non passa mai da
 * `new Date('YYYY-MM-DD')`, che la interpreterebbe come mezzanotte UTC e in
 * Italia la sposterebbe al giorno prima in certi contesti. Il "giorno di oggi"
 * si calcola sempre in un fuso esplicito (default Europe/Rome).
 */

declare const isoDateBrand: unique symbol
export type IsoDate = string & { readonly [isoDateBrand]: true }

export const DEFAULT_TIME_ZONE = 'Europe/Rome'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export function toIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new RangeError(`Data non valida: ${value}`)
  return value
}

export function isoDateFromParts(year: number, month: number, day: number): IsoDate {
  return toIsoDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

export function isoDateParts(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

/** Data di calendario di un istante in un fuso preciso. */
export function isoDateInTimeZone(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): IsoDate {
  // en-CA formatta come YYYY-MM-DD.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
  return toIsoDate(formatted)
}

export function today(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): IsoDate {
  return isoDateInTimeZone(now, timeZone)
}

/** Aritmetica sui giorni via UTC a mezzogiorno: nessun effetto dell'ora legale. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = isoDateParts(date)
  const utc = new Date(Date.UTC(year, month - 1, day, 12))
  utc.setUTCDate(utc.getUTCDate() + days)
  return isoDateFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate())
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = isoDateParts(date)
  return isoDateFromParts(year, month, 1)
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = isoDateParts(date)
  return isoDateFromParts(year, month, daysInMonth(year, month))
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Formato italiano per la UI: "3 ott 2026" (short) o "03/10/2026" (numeric). */
export function formatIsoDate(date: IsoDate, style: 'short' | 'long' | 'numeric' = 'short', locale = 'it-IT'): string {
  const { year, month, day } = isoDateParts(date)
  const options: Intl.DateTimeFormatOptions =
    style === 'numeric'
      ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }
      : { day: 'numeric', month: style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }
  // Istante costruito e formattato entrambi in UTC: il giorno non può cambiare.
  return new Intl.DateTimeFormat(locale, options).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
