/**
 * Conversione dei valori testuali dei CSV bancari. Mai float: gli importi
 * diventano centesimi interi lavorando sulle cifre.
 */
import { cents, type Cents } from '../money'
import { isIsoDate, isoDateInTimeZone, DEFAULT_TIME_ZONE, type IsoDate } from '../dates'

export type ValueResult<T> = { ok: true; value: T; warning?: string } | { ok: false; error: string }

/**
 * Importo con separatori variabili: "1.234,56", "1,234.56", "-300.00",
 * "(12,00)", "300,00-", "€ 5", "200.000000". `preferredDecimal` risolve solo
 * i casi ambigui con un unico separatore seguito da tre cifre ("1.650").
 * Oltre i centesimi arrotonda (metà lontano da zero) segnalandolo.
 */
export function parseAmount(raw: string, preferredDecimal: ',' | '.' = ','): ValueResult<Cents> {
  let text = raw.replace(/[\s  €$£]|EUR|USD|GBP|CHF/gi, '')
  if (text === '') return { ok: false, error: 'Importo mancante' }

  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  if (text.endsWith('-')) {
    negative = !negative
    text = text.slice(0, -1)
  }
  if (text.startsWith('-')) {
    negative = !negative
    text = text.slice(1)
  } else if (text.startsWith('+')) {
    text = text.slice(1)
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return { ok: false, error: `Importo non valido: "${raw}"` }

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  let decimalSeparator: ',' | '.' | null = null
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.'
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.'
    const occurrences = text.split(separator).length - 1
    const digitsAfter = text.length - text.lastIndexOf(separator) - 1
    if (occurrences > 1) decimalSeparator = null
    else if (digitsAfter === 3) decimalSeparator = separator === preferredDecimal ? separator : null
    else decimalSeparator = separator
  }

  let integerPart = text
  let fraction = ''
  if (decimalSeparator) {
    const index = text.lastIndexOf(decimalSeparator)
    integerPart = text.slice(0, index)
    fraction = text.slice(index + 1)
  }
  const thousands = decimalSeparator === ',' ? '.' : decimalSeparator === '.' ? ',' : /[.,]/
  integerPart = integerPart.split(thousands).join('')
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fraction)) return { ok: false, error: `Importo non valido: "${raw}"` }

  const cents2 = (fraction + '00').slice(0, 2)
  const rest = fraction.slice(2)
  let value = Number((integerPart || '0') + cents2)
  let warning: string | undefined
  if (/[1-9]/.test(rest)) {
    if (Number(rest[0]) >= 5) value += 1
    warning = `Importo arrotondato al centesimo: "${raw}"`
  }
  if (!Number.isSafeInteger(value)) return { ok: false, error: `Importo fuori intervallo: "${raw}"` }
  const result = cents(negative && value !== 0 ? -value : value)
  return warning ? { ok: true, value: result, warning } : { ok: true, value: result }
}

/** Valore decimale come stringa normalizzata (quantità e prezzi: restano numeric, mai float). */
export function parseDecimalString(raw: string): ValueResult<string> | null {
  const text = raw.trim()
  if (text === '') return null
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return { ok: false, error: `Numero non valido: "${raw}"` }
  return { ok: true, value: text.replace(',', '.') }
}

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD-MM-YYYY'

const DATE_PATTERNS: Record<DateFormat, RegExp> = {
  'DD/MM/YYYY': /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  'DD.MM.YYYY': /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
  'DD-MM-YYYY': /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  'YYYY-MM-DD': /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
}

/** Data di calendario senza fuso: nessuna conversione via Date. */
export function parseDate(raw: string, formats: readonly DateFormat[]): ValueResult<IsoDate> {
  const text = raw.trim()
  if (text === '') return { ok: false, error: 'Data mancante' }
  for (const format of formats) {
    const match = DATE_PATTERNS[format].exec(text)
    if (!match) continue
    const [a, b, c] = [match[1]!, match[2]!, match[3]!]
    const [year, month, day] = format === 'YYYY-MM-DD' ? [a, b, c] : [c, b, a]
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    if (isIsoDate(iso)) return { ok: true, value: iso }
    return { ok: false, error: `Data inesistente: "${raw}"` }
  }
  return { ok: false, error: `Data non valida: "${raw}"` }
}

/**
 * Data e ora. Con fuso esplicito (Z o ±hh:mm) l'istante viene convertito nel
 * giorno di calendario di Europe/Rome; senza fuso è già ora locale e si
 * prende la parte di data così com'è.
 */
export function parseDateTime(
  raw: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): ValueResult<{ date: IsoDate; instant: string | null }> {
  const text = raw.trim()
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(text)
  if (!match) {
    const dateOnly = parseDate(text, ['YYYY-MM-DD'])
    return dateOnly.ok ? { ok: true, value: { date: dateOnly.value, instant: null } } : dateOnly
  }
  const datePart = match[1]!
  if (!isIsoDate(datePart)) return { ok: false, error: `Data inesistente: "${raw}"` }
  if (!match[5]) return { ok: true, value: { date: datePart, instant: null } }
  const instant = new Date(text.replace(' ', 'T'))
  if (Number.isNaN(instant.getTime())) return { ok: false, error: `Data e ora non valide: "${raw}"` }
  return { ok: true, value: { date: isoDateInTimeZone(instant, timeZone), instant: instant.toISOString() } }
}

/**
 * Descrizione normalizzata per confronti e fingerprint: minuscole, senza
 * accenti né punteggiatura, spazi compattati. Non sostituisce mai l'originale.
 */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Descrizione leggibile: spazi compattati, maiuscole conservate. */
export function cleanDescription(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function detectCurrency(raw: string | undefined, fallback = 'EUR'): ValueResult<string> {
  const text = (raw ?? '').trim().toUpperCase()
  if (text === '') return { ok: true, value: fallback }
  if (text === '€') return { ok: true, value: 'EUR' }
  if (/^[A-Z]{3}$/.test(text)) return { ok: true, value: text }
  return { ok: false, error: `Valuta non valida: "${raw}"` }
}
