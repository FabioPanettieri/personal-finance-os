import Link from 'next/link'

import { cn } from '@/lib/utils/cn'
import { formatIsoDate } from '@/lib/dates'
import { PERIOD_LABELS, PERIOD_PRESETS, periodSearch, type Period } from '@/lib/dashboard/period'

/**
 * Selettore del periodo: semplici link (funziona senza JavaScript, è
 * condivisibile e il tasto indietro del browser lo ripristina). Il periodo
 * personalizzato usa un form GET con due date.
 */
export function PeriodSelector({ period }: { period: Period }) {
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Periodo" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {PERIOD_PRESETS.filter((p) => p !== 'custom').map((preset) => {
          const search = periodSearch({ preset, from: period.from, to: period.to })
          const current = period.preset === preset
          return (
            <Link
              key={preset}
              href={search ? `/?${search}` : '/'}
              aria-current={current ? 'page' : undefined}
              scroll={false}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm transition-colors sm:min-h-9',
                current ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-muted hover:text-fg',
              )}
            >
              {PERIOD_LABELS[preset]}
            </Link>
          )
        })}
      </nav>
      <details className="group text-sm" open={period.preset === 'custom'}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-fg-muted hover:text-fg sm:min-h-8">
          {period.preset === 'custom' ? `Personalizzato: ${formatIsoDate(period.from)} – ${formatIsoDate(period.to)}` : 'Periodo personalizzato…'}
        </summary>
        <form method="get" action="/" className="mt-2 flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value="custom" />
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Dal
            <input
              type="date"
              name="from"
              required
              defaultValue={period.from}
              className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-fg">
            Al
            <input
              type="date"
              name="to"
              required
              defaultValue={period.to}
              className="h-11 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-fg"
            />
          </label>
          <button type="submit" className="h-11 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">
            Applica
          </button>
        </form>
      </details>
    </div>
  )
}
