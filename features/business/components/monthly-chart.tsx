'use client'

import { useState } from 'react'

import { niceTicks } from '@/lib/charts/scale'
import type { BusinessMonth } from '@/lib/dashboard/business'
import { formatMoney, type Cents } from '@/lib/money'
import { cn } from '@/lib/utils/cn'

const MONTH = new Intl.DateTimeFormat('it-IT', { month: 'short', timeZone: 'UTC' })
const MONTH_LONG = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

/**
 * Incassi e spese mese per mese: due barre affiancate (colori validati per
 * daltonismo, token --chart-income / --chart-expense), un solo asse, legenda,
 * dettaglio del mese al passaggio o al tocco e tabella dei dati.
 */
export function BusinessMonthlyChart({
  months,
  currency,
  label,
  series = ['Incassi', 'Spese'],
}: {
  months: BusinessMonth[]
  currency: string
  label: string
  /** Nomi delle due serie (es. Entrate/Uscite nei report). */
  series?: [string, string]
}) {
  const lastWithData = months.reduce((found, m, i) => (m.count > 0 ? i : found), months.length - 1)
  const [active, setActive] = useState(lastWithData)
  const max = Math.max(1, ...months.flatMap((m) => [m.revenue, m.expenses]))
  const { ticks, domain } = niceTicks(0, max, 3)
  // Area del grafico in unità SVG; il testo è HTML fuori dall'SVG, così resta leggibile a ogni larghezza.
  const w = 600
  const h = 180
  const y = (v: number) => h - (v / domain[1]) * h
  const group = w / months.length
  const bar = Math.max(4, Math.min(16, (group - 10) / 2))
  const current = months[active]
  const money = (v: Cents) => formatMoney(v, { currency })

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-[13px] text-fg-muted" aria-label="Legenda">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-chart-income" /> {series[0]}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-chart-expense" /> {series[1]}
          </li>
        </ul>
        {current ? (
          <p aria-live="polite" className="text-[13px] text-fg-muted" data-testid="chart-month">
            <span className="font-semibold text-fg capitalize">{MONTH_LONG.format(toDate(current.month))}</span> · {money(current.revenue)} − {money(current.expenses)} ={' '}
            <span className={cn('font-semibold', current.profit > 0 ? 'text-positive' : current.profit < 0 ? 'text-negative' : 'text-fg')}>{money(current.profit)}</span>
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <div aria-hidden className="relative h-44 w-12 shrink-0 text-right text-[11px] text-fg-subtle">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(y(t) / h) * 100}%` }}>
              {formatMoney(t as Cents, { currency, compact: true })}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-44 w-full overflow-visible">
            {ticks.map((t) => (
              <line key={t} x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {months.map((m, i) => {
              const x0 = i * group + (group - bar * 2 - 2) / 2
              const bars = [
                { v: m.revenue, x: x0, color: 'var(--chart-income)' },
                { v: m.expenses, x: x0 + bar + 2, color: 'var(--chart-expense)' },
              ]
              return (
                <g key={m.month} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} className="cursor-pointer">
                  <rect x={i * group} y={0} width={group} height={h} fill={i === active ? 'var(--surface-2)' : 'transparent'} />
                  {bars.map((b, j) => (b.v > 0 ? <path key={j} d={roundedTop(b.x, y(b.v), bar, h - y(b.v))} fill={b.color} /> : null))}
                </g>
              )
            })}
          </svg>
          <div aria-hidden className="mt-1 grid text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((m, i) => (
              <button key={m.month} type="button" tabIndex={-1} onClick={() => setActive(i)} className={i === active ? 'font-semibold text-fg' : 'text-fg-subtle'}>
                {MONTH.format(toDate(m.month)).replace('.', '')}
              </button>
            ))}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-[13px] text-fg-muted">Mostra i dati in tabella</summary>
        <table className="mt-2 w-full text-left text-[13px]">
          <thead className="text-fg-muted">
            <tr>
              <th className="py-1 font-medium">Mese</th>
              <th className="py-1 text-right font-medium">{series[0]}</th>
              <th className="py-1 text-right font-medium">{series[1]}</th>
              <th className="py-1 text-right font-medium">Differenza</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t border-line">
                <td className="py-1 capitalize">{MONTH_LONG.format(toDate(m.month))}</td>
                <td className="py-1 text-right tabular">{money(m.revenue)}</td>
                <td className="py-1 text-right tabular">{money(m.expenses)}</td>
                <td className="py-1 text-right tabular">{money(m.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/** Barra con angoli superiori arrotondati (4px) e base piatta sull'asse. */
function roundedTop(x: number, yTop: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height)
  return `M${x},${yTop + height} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + width - r} Q${x + width},${yTop} ${x + width},${yTop + r} V${yTop + height} Z`
}
