/**
 * Importi in centesimi interi (docs/00-architecture.md §1). Nessun calcolo
 * finanziario usa float: `Cents` è un intero sicuro con brand di tipo, così
 * non si può passare per errore un importo in euro dove servono centesimi.
 */

declare const centsBrand: unique symbol
export type Cents = number & { readonly [centsBrand]: true }

export class MoneyError extends Error {
  override name = 'MoneyError'
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Importo non valido in centesimi: ${value}`)
  }
  return value as Cents
}

/** Accetta il bigint di PostgreSQL serializzato come number o string. */
export function centsFromDb(value: number | string | bigint): Cents {
  if (typeof value === 'number') return cents(value)
  const asBigInt = typeof value === 'bigint' ? value : BigInt(value)
  if (asBigInt > BigInt(Number.MAX_SAFE_INTEGER) || asBigInt < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError(`Importo fuori dall'intervallo sicuro: ${value}`)
  }
  return cents(Number(asBigInt))
}

export const ZERO = cents(0)

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b)
}

export function subtractCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isSafeInteger(total)) throw new MoneyError('Somma fuori dall\'intervallo sicuro')
  }
  return cents(total)
}

export function negateCents(value: Cents): Cents {
  return cents(value === 0 ? 0 : -value)
}

export function absCents(value: Cents): Cents {
  return cents(Math.abs(value))
}

export type FormatMoneyOptions = {
  currency?: string
  locale?: string
  /** Mostra il segno anche per i positivi (+). */
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never'
  /** Abbrevia (es. 12,4 k) — solo per assi dei grafici, mai per i valori. */
  compact?: boolean
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function formatter(key: string, factory: () => Intl.NumberFormat): Intl.NumberFormat {
  let cached = formatterCache.get(key)
  if (!cached) {
    cached = factory()
    formatterCache.set(key, cached)
  }
  return cached
}

/**
 * Formatta per la visualizzazione. La divisione per 100 avviene solo qui,
 * all'ultimo passo, e il risultato non rientra mai nei calcoli.
 */
export function formatMoney(value: Cents, options: FormatMoneyOptions = {}): string {
  const { currency = 'EUR', locale = 'it-IT', signDisplay = 'auto', compact = false } = options
  const key = `${locale}|${currency}|${signDisplay}|${compact}`
  const fmt = formatter(key, () =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      signDisplay,
      // CLDR it-IT non raggruppa i numeri a 4 cifre ("1234,56"): in una
      // tabella finanziaria il separatore deve esserci sempre ("1.234,56").
      useGrouping: 'always',
      ...(compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }),
  )
  return fmt.format(value / 100)
}

/** Variazione percentuale tra due importi; null se il riferimento è zero. */
export function percentChange(current: Cents, previous: Cents): number | null {
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

export function formatPercent(ratio: number, locale = 'it-IT', signDisplay: 'auto' | 'exceptZero' = 'auto'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay,
  }).format(ratio)
}
