import { ChevronRight, CircleAlert } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import { formatIsoDate, type IsoDate } from '@/lib/dates'
import { netWorthSeries, type NetWorthBreakdown, type NetWorthPoint } from '@/lib/dashboard/metrics'
import { addMonths, PERIOD_LABELS, periodSearch, type Period, type PeriodPreset } from '@/lib/dashboard/period'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

/** Periodi principali in vista; gli altri restano a un tocco in "Altro". */
const MAIN_PERIODS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'this-month', label: 'Mese' },
  { preset: '3m', label: '3 mesi' },
  { preset: 'ytd', label: 'Anno' },
  { preset: 'all', label: 'Tutto' },
]
const OTHER_PERIODS: PeriodPreset[] = ['last-month', '6m', 'last-year']

export function PeriodTabs({ period, basePath = '/' }: { period: Period; basePath?: string }) {
  const href = (preset: PeriodPreset) => {
    const search = periodSearch({ preset, from: period.from, to: period.to })
    return search ? `${basePath}?${search}` : basePath
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Periodo" className="flex rounded-full border border-line bg-surface p-1">
        {MAIN_PERIODS.map(({ preset, label }) => {
          const active = period.preset === preset
          return (
            <Link
              key={preset}
              href={href(preset)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-semibold transition-colors sm:min-h-9',
                active ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg',
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
      <details className="relative">
        <summary
          className={cn(
            'inline-flex min-h-10 cursor-pointer list-none items-center rounded-full border border-line px-4 text-[13px] font-semibold sm:min-h-9',
            OTHER_PERIODS.includes(period.preset) || period.preset === 'custom' ? 'bg-fg text-canvas' : 'bg-surface text-fg-muted hover:text-fg',
          )}
        >
          {OTHER_PERIODS.includes(period.preset) || period.preset === 'custom' ? PERIOD_LABELS[period.preset] : 'Altro'}
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3 shadow-xl">
          <ul className="mb-3 flex flex-col">
            {OTHER_PERIODS.map((preset) => (
              <li key={preset}>
                <Link href={href(preset)} className="block rounded-[10px] px-3 py-2.5 text-sm text-fg hover:bg-surface">
                  {PERIOD_LABELS[preset]}
                </Link>
              </li>
            ))}
          </ul>
          <form method="get" action={basePath} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="period" value="custom" />
            <p className="text-xs font-medium text-fg-muted">Date a scelta</p>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
                Dal
                <input type="date" name="from" required defaultValue={period.from} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-sm text-fg" />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
                Al
                <input type="date" name="to" required defaultValue={period.to} className="h-10 rounded-[10px] border border-line bg-surface px-2 text-sm text-fg" />
              </label>
            </div>
            <button type="submit" className="h-10 rounded-full bg-fg text-sm font-semibold text-canvas">
              Applica
            </button>
          </form>
        </div>
      </details>
    </div>
  )
}

/** Linea dell'andamento (ultimi 6 mesi), senza assi: è un colpo d'occhio, i dettagli sono nei conti. */
function Sparkline({ history, today }: { history: NetWorthPoint[]; today: IsoDate }) {
  const points = netWorthSeries(history, addMonths(today, -6), today)
  if (points.length < 2) return null
  const w = 640
  const h = 96
  const values = points.map((p) => p.balance)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 6 - ((p.balance - min) / span) * (h - 12)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-20 w-full lg:h-24" role="img" aria-label={`Andamento del patrimonio dal ${formatIsoDate(points[0]!.date)} a oggi`}>
      <defs>
        <linearGradient id="nw-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--fg)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--fg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#nw-fill)" />
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function NetWorthHero({
  breakdown,
  monthChange,
  history,
  today,
  currency,
  hasData,
}: {
  breakdown: NetWorthBreakdown
  monthChange: Cents | null
  history: NetWorthPoint[]
  today: IsoDate
  currency: string
  hasData: boolean
}) {
  const legend = [
    { label: 'Liquidità', value: breakdown.liquidity, color: 'var(--fg)' },
    { label: 'Investimenti', value: breakdown.investedAtCost, color: 'var(--bank-tr)' },
    { label: 'Carta', value: breakdown.cards, color: 'var(--bank-ing)' },
  ].filter((l, i) => i === 0 || l.value !== 0)
  return (
    <section aria-label="Patrimonio netto" data-testid="kpi-net-worth" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6 lg:p-7">
      <p className="text-sm font-medium text-fg-muted">Patrimonio netto</p>
      {hasData ? (
        <Money value={breakdown.netWorth} currency={currency} emphasizeUnits className="text-[44px] leading-none font-bold tracking-[-0.03em] text-fg lg:text-[56px]" />
      ) : (
        <p className="text-[44px] leading-none font-bold text-fg-subtle">—</p>
      )}
      {monthChange !== null ? (
        <p className="flex items-center gap-2 text-[13px] text-fg-muted">
          <span className={cn('rounded-full px-2.5 py-1 font-semibold', monthChange >= 0 ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative')}>
            {monthChange >= 0 ? '▲' : '▼'} <Money value={(monthChange < 0 ? -monthChange : monthChange) as Cents} currency={currency} />
          </span>
          rispetto a un mese fa
        </p>
      ) : (
        <p className="text-[13px] text-fg-muted">{hasData ? 'Il confronto con un mese fa arriva con più dati.' : 'Importa un estratto per iniziare.'}</p>
      )}
      <Sparkline history={history} today={today} />
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: l.color }} />
            <span className="text-fg-muted">{l.label}</span>
            <Money value={l.value} currency={currency} className="font-semibold text-fg" />
          </li>
        ))}
      </ul>
      {breakdown.investedAtCost !== 0 ? (
        <p className="text-xs text-fg-subtle">
          Investimenti al prezzo d’acquisto.{' '}
          <Link href="/investments" className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
            Valore di mercato e rendimento →
          </Link>
        </p>
      ) : null}
    </section>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100)) : 0
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-surface-2">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  )
}

export function MonthSummary({
  title,
  income,
  expenses,
  incomeHref,
  expensesHref,
  currency,
}: {
  title: string
  income: Cents
  expenses: Cents
  incomeHref: string
  expensesHref: string
  currency: string
}) {
  const left = income - expenses
  const max = Math.max(income, expenses)
  return (
    <section aria-label={title} className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-line bg-surface p-6 lg:p-7">
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      <Link href={incomeHref} className="group flex flex-col gap-2" data-testid="kpi-income">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-fg-muted group-hover:text-fg">Entrate</span>
          <Money value={income} currency={currency} signDisplay="exceptZero" className="text-xl font-bold text-positive" />
        </span>
        <Bar value={income} max={max} color="var(--positive)" />
      </Link>
      <Link href={expensesHref} className="group flex flex-col gap-2" data-testid="kpi-expenses">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-fg-muted group-hover:text-fg">Uscite</span>
          <Money value={(expenses === 0 ? 0 : -expenses) as Cents} currency={currency} signDisplay="exceptZero" className="text-xl font-bold text-negative" />
        </span>
        <Bar value={expenses} max={max} color="var(--negative)" />
      </Link>
      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-4" data-testid="kpi-cash-flow">
        <span className="text-[15px] font-medium text-fg">{left >= 0 ? 'Ti restano' : 'Hai speso più di quanto è entrato'}</span>
        <Money value={(left < 0 ? -left : left) as Cents} currency={currency} className={cn('text-[22px] font-bold', left >= 0 ? 'text-fg' : 'text-negative')} />
      </div>
    </section>
  )
}

export function ReviewBanner({ transactions, importRows }: { transactions: number; importRows: number }) {
  const total = transactions + importRows
  if (total === 0) return null
  const href = transactions > 0 ? '/transactions?status=review' : '/imports'
  return (
    <Link
      href={href}
      data-testid="review-card"
      className="flex items-center gap-4 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft px-5 py-4 transition-colors hover:border-warning/70"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
        <CircleAlert aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">
          {total === 1 ? '1 movimento da sistemare' : `${total} movimenti da sistemare`}
        </span>
        <span className="block text-[13px] text-fg-muted">
          {transactions > 0 ? 'Dimmi tu cosa sono: bastano due tocchi ciascuno.' : 'Sono in un’importazione da confermare.'}
        </span>
      </span>
      <span className="hidden items-center rounded-full bg-fg px-4 py-2 text-sm font-semibold text-canvas sm:inline-flex">Sistema ora</span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-warning sm:hidden" />
    </Link>
  )
}

export type SpendingItem = { key: string; label: string; amount: Cents; share: number; href: string }

export function SpendingList({ items, currency }: { items: SpendingItem[]; currency: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">Nessuna spesa in questo periodo.</p>
  const max = Math.max(...items.map((i) => i.amount))
  return (
    <ul aria-label="Spese per categoria" className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className="-mx-2 flex flex-col gap-2 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-surface-2">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px] font-medium text-fg">{item.label}</span>
              <Money value={item.amount} currency={currency} className="shrink-0 text-[15px] font-semibold text-fg" />
            </span>
            <Bar value={item.amount} max={max} color="var(--fg-muted)" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
