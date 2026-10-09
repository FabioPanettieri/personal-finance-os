import { ArrowDownLeft, ArrowUpRight, Briefcase, ChevronRight } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import type { BusinessPerformance } from '@/lib/dashboard/metrics'
import type { DateRange } from '@/lib/dashboard/period'
import { formatPercent } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'
import { cn } from '@/lib/utils/cn'

/** Colori di riserva per le attività senza colore. */
const FALLBACK = ['#7C6CF2', '#E5484D', '#12A594', '#F76B15']

export function businessColor(b: Pick<BusinessPerformance, 'color'>, index: number): string {
  return b.color ?? FALLBACK[index % FALLBACK.length]!
}

/** "Su 100 € incassati ne restano 35 €": il margine detto in modo comprensibile. */
function marginSentence(b: BusinessPerformance): string {
  if (b.revenue === 0 && b.expenses === 0) return 'Nessun incasso né spesa nel periodo'
  if (b.revenue === 0) return 'Solo spese nel periodo, nessun incasso'
  const kept = Math.round((b.margin ?? 0) * 100)
  return kept >= 0 ? `Su 100 € incassati te ne restano ${kept}` : `Per ogni 100 € incassati ne spendi ${100 - kept}`
}

/**
 * Una card per attività, nel colore dell'attività: utile in grande, poi il
 * conto "incassi − spese = utile" e quanto resta su 100 € incassati. Solo i
 * movimenti classificati con quel business: una spesa personale non diventa
 * mai una spesa business.
 */
export function BusinessCards({ items, currency, range }: { items: BusinessPerformance[]; currency: string; range: DateRange }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">Nessuna attività configurata.</p>
  return (
    <ul aria-label="Andamento delle attività" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map((b, index) => {
        const color = businessColor(b, index)
        const share = b.revenue > 0 ? Math.min(1, b.expenses / b.revenue) : b.expenses > 0 ? 1 : 0
        return (
          <li
            key={b.businessId}
            data-testid={`business-${b.name}`}
            className="relative min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:p-6"
          >
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-25" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
            <div className="relative flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-[18px] font-bold text-fg">
                <Link href={`/business/${b.businessId}`} className="inline-flex max-w-full items-center gap-2 hover:underline">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: color }}>
                    <Briefcase aria-hidden className="size-4" />
                  </span>
                  <span className="truncate">{b.name}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-muted" />
                </Link>
              </h2>
              <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: `linear-gradient(rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.35)), ${color}` }}>
                Margine <span data-testid="margin">{b.margin === null ? 'N/D' : formatPercent(b.margin)}</span>
              </span>
            </div>

            <p className="relative mt-5 text-[13px] font-medium text-fg-muted">Utile del periodo</p>
            <Money
              value={b.profit}
              currency={currency}
              signDisplay="exceptZero"
              emphasizeUnits
              className={cn('relative block text-[36px] font-bold tracking-[-0.02em]', b.profit > 0 ? 'text-positive' : b.profit < 0 ? 'text-negative' : 'text-fg')}
            />
            <p className="relative text-[13px] text-fg-muted">{marginSentence(b)}</p>

            <div aria-hidden className={cn('relative mt-4 h-2.5 overflow-hidden rounded-full', b.revenue > 0 ? 'bg-positive/30' : 'bg-surface-2')}>
              <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: 'var(--chart-expense)' }} />
            </div>

            <div className="relative mt-3 grid grid-cols-2 gap-3 text-sm">
              <Link
                href={transactionsHref({ businessId: b.businessId, type: 'income', ...range })}
                className="rounded-[14px] border border-positive/25 bg-positive-soft p-3 transition-colors hover:border-positive/60"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-positive">
                  <ArrowDownLeft aria-hidden className="size-4" /> Incassi
                </span>
                <span className="mt-0.5 block text-[18px] font-bold text-fg">
                  <Money value={b.revenue} currency={currency} />
                </span>
              </Link>
              <Link
                href={transactionsHref({ businessId: b.businessId, type: 'spending', ...range })}
                className="rounded-[14px] border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
                  <ArrowUpRight aria-hidden className="size-4" style={{ color: 'var(--chart-expense)' }} /> Spese
                </span>
                <span className="mt-0.5 block text-[18px] font-bold text-fg">
                  <Money value={b.expenses} currency={currency} />
                </span>
              </Link>
            </div>
            <Link
              href={transactionsHref({ businessId: b.businessId, ...range })}
              className="relative mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg"
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
