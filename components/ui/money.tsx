import { formatMoney, type Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

export type MoneyProps = {
  value: Cents
  currency?: string
  /** Colora in base al segno: verde per positivi, rosso per negativi. */
  tone?: 'none' | 'signed'
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never'
  /** Centesimi più piccoli e leggeri: per gli importi hero. */
  emphasizeUnits?: boolean
  className?: string
}

/**
 * Unico modo di mostrare un importo nella UI (docs/00-architecture.md §6):
 * riceve centesimi interi, formatta in it-IT con cifre tabulari.
 */
export function Money({
  value,
  currency = 'EUR',
  tone = 'none',
  signDisplay = 'auto',
  emphasizeUnits = false,
  className,
}: MoneyProps) {
  const formatted = formatMoney(value, { currency, signDisplay })
  const toneClass = tone === 'signed' ? (value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : undefined) : undefined

  if (!emphasizeUnits) {
    return <span className={cn('tabular', toneClass, className)}>{formatted}</span>
  }

  // "1.234,56 €" → parte intera e decimali separati per la gerarchia visiva.
  const match = /^(.*\d)(,\d{2})(.*)$/.exec(formatted)
  if (!match) return <span className={cn('tabular', toneClass, className)}>{formatted}</span>
  const [, units, decimals, suffix] = match

  return (
    // role="img": l'importo si legge intero ("1.234,56 €") e l'aria-label è ammessa (WCAG, axe aria-prohibited-attr).
    <span role="img" className={cn('tabular', toneClass, className)} aria-label={formatted}>
      <span aria-hidden>{units}</span>
      <span aria-hidden className="text-[0.6em] font-normal text-fg-muted">
        {decimals}
      </span>
      <span aria-hidden className="text-[0.6em] font-normal text-fg-muted">
        {suffix}
      </span>
    </span>
  )
}
