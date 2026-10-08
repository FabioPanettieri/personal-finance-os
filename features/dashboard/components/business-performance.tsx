import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import type { BusinessPerformance } from '@/lib/dashboard/metrics'
import type { DateRange } from '@/lib/dashboard/period'
import { formatPercent } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'

/**
 * Una card per attività: utile in grande, poi incassi, spese e margine.
 * Solo i movimenti classificati con quel business: una spesa personale non
 * diventa mai una spesa business. Margine N/D quando i ricavi sono zero.
 */
export function BusinessCards({ items, currency, range }: { items: BusinessPerformance[]; currency: string; range: DateRange }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">Nessuna attività configurata.</p>
  return (
    <ul aria-label="Andamento delle attività" className="grid gap-4 lg:grid-cols-2">
      {items.map((b) => {
        const share = b.revenue > 0 ? Math.min(1, b.expenses / b.revenue) : b.expenses > 0 ? 1 : 0
        return (
          <li key={b.businessId} data-testid={`business-${b.name}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[17px] font-semibold text-fg">{b.name}</h2>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">
                Margine{' '}
                <span className="font-semibold text-fg tabular" data-testid="margin">
                  {b.margin === null ? 'N/D' : formatPercent(b.margin)}
                </span>
              </span>
            </div>
            <p className="mt-4 text-[13px] font-medium text-fg-muted">Utile</p>
            <Money
              value={b.profit}
              currency={currency}
              signDisplay="exceptZero"
              emphasizeUnits
              className={cn('block text-[34px] font-bold tracking-[-0.02em]', b.profit > 0 ? 'text-positive' : b.profit < 0 ? 'text-negative' : 'text-fg')}
            />
            <div aria-hidden className={cn('mt-4 h-2 overflow-hidden rounded-full', b.revenue > 0 ? 'bg-positive/25' : 'bg-surface-2')}>
              <div className="h-full rounded-full bg-negative/80" style={{ width: `${share * 100}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Link href={transactionsHref({ businessId: b.businessId, type: 'income', ...range })} className="rounded-[14px] bg-surface-2 p-3 hover:bg-line">
                <span className="block text-fg-muted">Incassi</span>
                <span className="mt-0.5 block text-[17px] font-semibold text-fg">
                  <Money value={b.revenue} currency={currency} />
                </span>
              </Link>
              <Link href={transactionsHref({ businessId: b.businessId, type: 'spending', ...range })} className="rounded-[14px] bg-surface-2 p-3 hover:bg-line">
                <span className="block text-fg-muted">Spese</span>
                <span className="mt-0.5 block text-[17px] font-semibold text-fg">
                  <Money value={b.expenses} currency={currency} />
                </span>
              </Link>
            </div>
            <Link
              href={transactionsHref({ businessId: b.businessId, ...range })}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg"
            >
              {b.count === 0 ? 'Nessun movimento nel periodo' : b.count === 1 ? '1 movimento' : `${b.count} movimenti`}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
