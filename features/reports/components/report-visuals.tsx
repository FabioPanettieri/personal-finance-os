import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Info, PiggyBank, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { Money } from '@/components/ui/money'
import type { Cents } from '@/lib/money'
import type { Insight } from '@/lib/reports/insights'
import { cn } from '@/lib/utils/cn'

/** Anello della quota risparmiata (0–100%). */
function SavingsRing({ rate }: { rate: number | null }) {
  const r = 42
  const c = 2 * Math.PI * r
  const value = rate === null ? 0 : Math.max(0, Math.min(1, rate))
  return (
    <div className="relative grid size-28 shrink-0 place-items-center" role="img" aria-label={rate === null ? 'Quota risparmiata non disponibile' : `Quota risparmiata ${Math.round(value * 100)}%`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${value * c} ${c}`} />
      </svg>
      <span className="text-center text-white">
        <span className="block text-[22px] leading-none font-extrabold">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
        <span className="text-[11px] text-white/80">risparmiato</span>
      </span>
    </div>
  )
}

/** Testata del report: quanto hai messo da parte nel periodo, a colpo d'occhio. */
export function ReportHero({ label, saved, rate, currency }: { label: string; saved: number; rate: number | null; currency: string }) {
  const good = saved >= 0
  const background = good
    ? 'linear-gradient(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.3)), linear-gradient(135deg, #12A594, #4F5BD5 60%, #8E4EC6)'
    : 'linear-gradient(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.3)), linear-gradient(135deg, #E5484D, #E8853B)'
  return (
    <section data-testid="report-hero" aria-label={`Riepilogo ${label}`} className="mb-6 flex items-center justify-between gap-4 rounded-[var(--radius-card)] p-5 text-white lg:p-7" style={{ background }}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-white/85 uppercase">
          <PiggyBank aria-hidden className="size-4" /> {good ? 'Messo da parte' : 'Speso più di quanto entrato'}
        </p>
        <Money value={Math.abs(saved) as Cents} currency={currency} className="mt-1 block text-[34px] font-extrabold tracking-[-0.02em] text-white lg:text-[44px]" />
        <p className="text-[14px] text-white/85">{label}</p>
      </div>
      <SavingsRing rate={rate} />
    </section>
  )
}

/** Variazione rispetto al periodo precedente, con freccia e colore (per le uscite salire è male). */
function Delta({ value, previous, inverse = false }: { value: number; previous: number | null; inverse?: boolean }) {
  if (previous === null || previous === 0) return null
  const change = (value - previous) / Math.abs(previous)
  if (Math.abs(change) < 0.005) return <span className="text-[12px] font-semibold text-fg-muted">= uguale</span>
  const up = change > 0
  const good = inverse ? !up : up
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold', good ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative')}>
      <Icon aria-hidden className="size-3.5" />
      {up ? '+' : '−'}
      {Math.round(Math.abs(change) * 100)}%
    </span>
  )
}

export function ReportKpi({
  label,
  value,
  previous,
  previousLabel,
  href,
  testId,
  color,
  icon: Icon,
  inverse = false,
  currency,
}: {
  label: string
  value: number
  previous: number | null
  previousLabel: string
  href: string
  testId: string
  color: string
  icon: LucideIcon
  inverse?: boolean
  currency: string
}) {
  return (
    <Link href={href} data-testid={testId} className="group relative overflow-hidden rounded-[18px] border border-line bg-surface p-4 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-line-strong">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 opacity-[0.16]" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <span className="relative flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
          <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: color }}>
            <Icon aria-hidden className="size-3.5" />
          </span>
          {label}
        </span>
        <Delta value={value} previous={previous} inverse={inverse} />
      </span>
      <Money value={value as Cents} currency={currency} className="relative mt-2 block text-[24px] font-bold text-fg" />
      {previous !== null ? (
        <p className="relative mt-1 text-[12px] text-fg-muted">
          {previousLabel}: <Money value={previous as Cents} currency={currency} />
        </p>
      ) : null}
    </Link>
  )
}

export const KPI_ICONS = { income: ArrowDownLeft, expenses: ArrowUpRight } as const

const TONE: Record<Insight['tone'], { icon: LucideIcon; className: string }> = {
  positive: { icon: CheckCircle2, className: 'bg-positive-soft text-positive' },
  negative: { icon: TrendingDown, className: 'bg-negative-soft text-negative' },
  warning: { icon: AlertTriangle, className: 'bg-warning-soft text-warning' },
  neutral: { icon: Info, className: 'bg-surface-2 text-fg-muted' },
}

/** Osservazioni del periodo, ognuna con un'icona colorata secondo il tono. */
export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul aria-label="Osservazioni" className="grid gap-2 sm:grid-cols-2">
      {insights.map((i) => {
        const tone = TONE[i.tone]
        return (
          <li key={i.key} data-testid={`insight-${i.key}`} className="flex gap-3 rounded-[16px] border border-line bg-surface-2 p-3 text-[15px] leading-snug text-fg">
            <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone.className)}>
              <tone.icon className="size-4" />
            </span>
            <span className="self-center">{i.text}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Ciambella delle spese per categoria (stessi colori dell'elenco accanto). */
export function CategoryDonut({ items, total, currency }: { items: { key: string; label: string; amount: number; color: string }[]; total: number; currency: string }) {
  const r = 40
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative mx-auto mb-4 grid size-44 place-items-center" role="img" aria-label={`Spese per categoria: ${items.map((i) => i.label).join(', ')}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        {total > 0
          ? items.map((i) => {
              const len = (i.amount / total) * c
              const el = <circle key={i.key} cx="50" cy="50" r={r} fill="none" stroke={i.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 0.8)} ${c}`} strokeDashoffset={-offset} />
              offset += len
              return el
            })
          : null}
      </svg>
      <span className="text-center">
        <span className="block text-[12px] text-fg-muted">Totale</span>
        <Money value={total as Cents} currency={currency} className="text-[17px] font-bold text-fg" />
      </span>
    </div>
  )
}
