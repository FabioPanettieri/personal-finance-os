import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, ListOrdered, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Money } from '@/components/ui/money'
import type { MonthlyAccountFlow } from '@/lib/accounts'
import type { Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

const MONTH = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' })

export type FlowTileProps = {
  label: string
  icon: LucideIcon
  /** Colore della card (token CSS): icona, barre e bordo in evidenza. */
  color: string
  value: ReactNode
  hint: string
  href: string
  series: { month: string; value: number }[]
  testId: string
}

/** Andamento degli ultimi mesi: barre piccole, l'ultimo mese pieno, gli altri attenuati. */
function MiniBars({ series, color, label }: { series: FlowTileProps['series']; color: string; label: string }) {
  const max = Math.max(1, ...series.map((s) => s.value))
  return (
    <div className="mt-4">
      <div role="img" aria-label={label} className="flex h-12 items-end gap-1.5">
        {series.map((s, i) => (
          <span
            key={s.month}
            className="flex-1 rounded-t-[4px] transition-[height] duration-300"
            style={{
              height: `${Math.max(6, (s.value / max) * 100)}%`,
              background: color,
              opacity: s.value === 0 ? 0.15 : i === series.length - 1 ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1.5 text-center text-[10px] text-fg-subtle">
        {series.map((s) => (
          <span key={s.month} className="flex-1 truncate">
            {MONTH.format(new Date(`${s.month}T00:00:00Z`)).replace('.', '')}
          </span>
        ))}
      </div>
    </div>
  )
}

export function FlowTile({ label, icon: Icon, color, value, hint, href, series, testId }: FlowTileProps) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong lg:p-5"
    >
      {/* Alone colorato in alto: identifica la card a colpo d'occhio. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.14]" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <span className="relative flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full text-white" style={{ background: color }}>
            <Icon aria-hidden className="size-4" />
          </span>
          <span className="text-[12px] font-semibold tracking-wide text-fg-muted uppercase">{label}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="relative mt-3 text-xl font-bold tracking-[-0.01em] text-fg lg:text-2xl">{value}</span>
      <span className="relative text-xs text-fg-muted">{hint}</span>
      <MiniBars series={series} color={color} label={`${label}: andamento degli ultimi ${series.length} mesi`} />
      <span className="relative mt-3 text-[13px] font-medium text-fg-muted group-hover:text-fg">Vedi i movimenti</span>
    </Link>
  )
}

export function AccountFlowTiles({
  flows,
  monthly,
  currency,
  hrefs,
  windowLabel,
  transactionCount,
  lastActivity,
}: {
  flows: { income: Cents; netExpenses: Cents; transfersIn: Cents; transfersOut: Cents; refunds: Cents }
  monthly: MonthlyAccountFlow[]
  currency: string
  hrefs: { income: string; spending: string; transfers: string; all: string }
  windowLabel: string
  transactionCount: number
  lastActivity: string
}) {
  const pick = (key: 'income' | 'spending' | 'transfers' | 'count') => monthly.map((m) => ({ month: m.month, value: m[key] }))
  return (
    <section aria-label="Riepilogo movimenti" className={cn('mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mb-6 lg:grid-cols-4 lg:gap-4')}>
      <FlowTile
        testId="tile-income"
        label="Entrate"
        icon={ArrowDownLeft}
        color="var(--positive)"
        value={<Money value={flows.income} currency={currency} />}
        hint={windowLabel}
        href={hrefs.income}
        series={pick('income')}
      />
      <FlowTile
        testId="tile-spending"
        label="Uscite"
        icon={ArrowUpRight}
        color="var(--chart-expense)"
        value={<Money value={flows.netExpenses} currency={currency} />}
        hint={flows.refunds > 0 ? 'Al netto dei rimborsi' : windowLabel}
        href={hrefs.spending}
        series={pick('spending')}
      />
      <FlowTile
        testId="tile-transfers"
        label="Trasferimenti"
        icon={ArrowLeftRight}
        color="var(--chart-income)"
        value={
          <span className="flex flex-col text-base lg:text-lg">
            <span className="inline-flex items-center gap-1">
              <ArrowDownLeft aria-label="In entrata" className="size-4 text-fg-subtle" />
              <Money value={flows.transfersIn} currency={currency} />
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight aria-label="In uscita" className="size-4 text-fg-subtle" />
              <Money value={flows.transfersOut} currency={currency} />
            </span>
          </span>
        }
        hint="Tra i tuoi conti: non sono entrate né spese"
        href={hrefs.transfers}
        series={pick('transfers')}
      />
      <FlowTile
        testId="tile-count"
        label="Transazioni"
        icon={ListOrdered}
        color="var(--bank-revolut)"
        value={<span className="tabular">{transactionCount}</span>}
        hint={lastActivity}
        href={hrefs.all}
        series={pick('count')}
      />
    </section>
  )
}
