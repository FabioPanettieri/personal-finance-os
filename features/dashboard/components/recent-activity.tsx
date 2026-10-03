import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, LineChart, RotateCcw } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import { formatIsoDate } from '@/lib/dates'
import { cn } from '@/lib/utils/cn'
import type { RecentTransaction } from '@/server/repositories/dashboard'

const ICONS = { income: ArrowDownLeft, expense: ArrowUpRight, refund: RotateCcw, transfer: ArrowLeftRight, investment: LineChart }

/** Ultimi movimenti. Trasferimenti e investimenti in tono neutro: non sono entrate né spese. */
export function RecentActivity({ items }: { items: RecentTransaction[] }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">Nessun movimento.</p>
  return (
    <ul aria-label="Ultimi movimenti" className="divide-y divide-line">
      {items.map((t) => {
        const Icon = ICONS[t.type]
        const internal = t.type === 'transfer' || t.type === 'investment'
        return (
          <li key={t.id}>
            <Link href={`/transactions/${t.id}`} className="-mx-2 flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 transition-colors hover:bg-surface-2">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full',
                  internal ? 'border border-dashed border-line-strong text-fg-muted' : 'bg-surface-2 text-fg-muted',
                )}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{t.description}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {[t.accountName, internal ? (t.type === 'transfer' ? 'Trasferimento' : 'Investimento') : (t.businessName ?? t.categoryName), formatIsoDate(t.bookedOn)]
                    .filter(Boolean)
                    .join(' · ')}
                  {!t.isCategorized ? <span className="ml-1 text-warning">· da verificare</span> : null}
                </span>
              </span>
              <Money
                value={t.amount}
                currency={t.currency}
                signDisplay="exceptZero"
                tone={internal ? 'none' : 'signed'}
                className={cn('shrink-0 text-sm font-medium', internal && 'text-fg-muted')}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
