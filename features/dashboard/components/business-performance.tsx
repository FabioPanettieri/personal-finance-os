import Link from 'next/link'

import { Money } from '@/components/ui/money'
import type { BusinessPerformance } from '@/lib/dashboard/metrics'
import type { DateRange } from '@/lib/dashboard/period'
import { formatPercent } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'

/**
 * Ricavi, spese, utile e margine per attività. Solo i movimenti classificati
 * con quel business: una spesa personale non diventa mai una spesa business.
 * Margine N/D quando i ricavi sono zero (nessuna divisione per zero).
 */
export function BusinessPerformanceList({ items, currency, range }: { items: BusinessPerformance[]; currency: string; range: DateRange }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">Nessuna attività configurata.</p>
  return (
    <ul aria-label="Andamento delle attività" className="divide-y divide-line">
      {items.map((b) => (
        <li key={b.businessId} className="py-3 first:pt-0 last:pb-0" data-testid={`business-${b.name}`}>
          <div className="flex items-baseline justify-between gap-3">
            <Link
              href={transactionsHref({ businessId: b.businessId, from: range.from, to: range.to })}
              className="min-w-0 truncate text-sm font-semibold text-fg hover:text-accent"
            >
              {b.name}
            </Link>
            <span className="text-xs text-fg-muted">
              Margine{' '}
              <span className="font-medium text-fg tabular" data-testid="margin">
                {b.margin === null ? 'N/D' : formatPercent(b.margin)}
              </span>
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-fg-muted">Ricavi</dt>
              <dd className="mt-0.5 text-sm font-medium text-fg">
                <Money value={b.revenue} currency={currency} />
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Spese</dt>
              <dd className="mt-0.5 text-sm font-medium text-fg">
                <Money value={b.expenses} currency={currency} />
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Utile</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                <Money value={b.profit} currency={currency} tone="signed" signDisplay="exceptZero" />
              </dd>
            </div>
          </dl>
          {b.count === 0 ? <p className="mt-1 text-xs text-fg-subtle">Nessun movimento nel periodo</p> : null}
        </li>
      ))}
    </ul>
  )
}
