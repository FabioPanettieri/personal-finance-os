import Link from 'next/link'

import { Money } from '@/components/ui/money'
import { formatPercent, type Cents } from '@/lib/money'

export type BreakdownItem = { key: string; label: string; amount: Cents; share: number; count: number; href: string }

/**
 * Lista con barra orizzontale proporzionale: una sola serie, un solo colore
 * (la lunghezza dice già la grandezza). Importo, quota e numero di movimenti
 * sempre in testo; ogni riga apre la lista dei movimenti corrispondenti.
 */
export function BreakdownList({ items, currency, label, empty }: { items: BreakdownItem[]; currency: string; label: string; empty: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">{empty}</p>
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className="group -mx-2 block rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-surface-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium text-fg">{item.label}</span>
              <Money value={item.amount} currency={currency} className="shrink-0 font-medium text-fg" />
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 group-hover:bg-line">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(item.share > 0 ? 2 : 0, item.share * 100)}%` }} />
              </span>
              <span className="w-28 shrink-0 text-right text-xs text-fg-muted tabular">
                {formatPercent(item.share)} · {item.count === 1 ? '1 mov.' : `${item.count} mov.`}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
