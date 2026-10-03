import { cents, type Cents } from './index'

export type ParseAmountResult = { ok: true; value: Cents } | { ok: false; error: string }

/**
 * Importo digitato in un form, formato italiano: virgola per i decimali,
 * punto (opzionale) per le migliaia. Esempi validi: "1.234,56", "1234,5",
 * "-50", "€ 12,00". Il punto come decimale ("12.5") è ambiguo e viene
 * rifiutato. Non usa mai float: lavora sulle cifre.
 *
 * (Il parsing dei CSV bancari, con formati diversi per banca, è un'altra
 * funzione: lib/csv, Sprint 3.)
 */
export function parseAmountInput(raw: string): ParseAmountResult {
  const text = raw.replace(/[\s  €]/g, '')
  if (text === '') return { ok: false, error: 'Inserisci un importo' }

  const match = /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text)
  if (!match) {
    return /^[+-]?\d+\.\d{1,2}$/.test(text)
      ? { ok: false, error: 'Usa la virgola per i decimali (es. 12,50)' }
      : { ok: false, error: 'Importo non valido (es. 1.234,56)' }
  }

  const [, sign, integerPart = '0', decimals = ''] = match
  const digits = integerPart.replace(/\./g, '') + decimals.padEnd(2, '0')
  const value = Number(digits)
  if (!Number.isSafeInteger(value)) return { ok: false, error: 'Importo troppo grande' }
  return { ok: true, value: cents(sign === '-' && value !== 0 ? -value : value) }
}

/** Inverso di parseAmountInput, per precompilare i form: "1234,56" (senza simbolo). */
export function formatAmountInput(value: Cents): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const integer = Math.trunc(abs / 100)
  const decimals = String(abs % 100).padStart(2, '0')
  return `${sign}${integer},${decimals}`
}
