'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { linearScale, niceTicks } from '@/lib/charts/scale'
import { endOfMonth, type IsoDate } from '@/lib/dates'
import type { MonthBar } from '@/lib/dashboard/metrics'
import { formatMoney, type Cents } from '@/lib/money'
import { transactionsHref } from '@/lib/transactions/filters'

const HEIGHT = 220
const MARGIN = { top: 12, right: 8, bottom: 28, left: 56 }

const monthLabel = (month: IsoDate, style: 'short' | 'long' = 'short') =>
  new Intl.DateTimeFormat('it-IT', { month: style, year: style === 'long' ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(
    new Date(`${month}T12:00:00Z`),
  )

/**
 * Entrate e uscite per mese (barre affiancate, una scala). Trasferimenti e
 * investimenti non compaiono: non sono né entrate né uscite. Tooltip al
 * passaggio o da tastiera; clic su un mese → movimenti di quel mese.
 */
export function CashFlowChart({ bars, currency }: { bars: MonthBar[]; currency: string }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const geometry = useMemo(() => {
    const max = Math.max(0, ...bars.flatMap((b) => [b.income, b.expenses]))
    const min = Math.min(0, ...bars.flatMap((b) => [b.income, b.expenses]))
    const { ticks, domain } = niceTicks(min, max, 4)
    const y = linearScale(domain, [HEIGHT - MARGIN.bottom, MARGIN.top])
    const slot = (width - MARGIN.left - MARGIN.right) / Math.max(1, bars.length)
    const barWidth = Math.max(3, Math.min(28, (slot - 10) / 2))
    return { ticks, y, slot, barWidth, zero: y(0) }
  }, [bars, width])

  const href = (b: MonthBar) => transactionsHref({ from: b.month, to: endOfMonth(b.month) })
  const activeBar = active === null ? null : bars[active]
  const showEvery = Math.ceil(bars.length / Math.max(1, Math.floor((width - MARGIN.left) / 56)))

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const step = event.key === 'ArrowRight' ? 1 : -1
      setActive((c) => Math.min(bars.length - 1, Math.max(0, (c ?? (step > 0 ? -1 : bars.length)) + step)))
    } else if (event.key === 'Enter' && activeBar) {
      router.push(href(activeBar))
    } else if (event.key === 'Escape') setActive(null)
  }

  const rect = (x: number, value: Cents, fill: string) => {
    const top = geometry.y(Math.max(0, value))
    const bottom = geometry.y(Math.min(0, value))
    const h = Math.max(value === 0 ? 0 : 1, bottom - top)
    return <rect x={x} y={top} width={geometry.barWidth} height={h} rx={Math.min(4, geometry.barWidth / 2)} fill={fill} />
  }

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-fg-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-income" /> Entrate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-expense" /> Uscite
        </span>
      </div>
      <div ref={containerRef} className="relative">
        <svg
          role="img"
          aria-label="Entrate e uscite per mese"
          tabIndex={0}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-auto w-full touch-pan-y rounded-md outline-offset-4 select-none"
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          {geometry.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.y(tick)} y2={geometry.y(tick)} stroke="var(--line)" />
              <text x={MARGIN.left - 8} y={geometry.y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-fg-subtle text-[11px] tabular">
                {formatMoney(tick as Cents, { currency, compact: true })}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x0 = MARGIN.left + i * geometry.slot
            const center = x0 + geometry.slot / 2
            return (
              <g
                key={b.month}
                className="cursor-pointer"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onClick={() => router.push(href(b))}
              >
                {/* Area di aggancio più grande delle barre. */}
                <rect x={x0} y={MARGIN.top} width={geometry.slot} height={HEIGHT - MARGIN.top - MARGIN.bottom} fill={active === i ? 'var(--surface-2)' : 'transparent'} />
                {rect(center - geometry.barWidth - 1, b.income, 'var(--chart-income)')}
                {rect(center + 1, b.expenses, 'var(--chart-expense)')}
                {i % showEvery === 0 ? (
                  <text x={center} y={HEIGHT - 8} textAnchor="middle" className="fill-fg-subtle text-[11px]">
                    {monthLabel(b.month)}
                  </text>
                ) : null}
              </g>
            )
          })}
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={geometry.zero} y2={geometry.zero} stroke="var(--line-strong)" />
        </svg>
        {activeBar ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-card)]"
            style={{ left: Math.min(Math.max(MARGIN.left + active! * geometry.slot + geometry.slot / 2 - 90, 0), width - 180), width: 180 }}
          >
            <p className="font-medium text-fg capitalize">{monthLabel(activeBar.month, 'long')}</p>
            <p className="mt-1 flex justify-between gap-2 text-fg-muted">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-income" />Entrate</span>
              <span className="text-fg tabular">{formatMoney(activeBar.income, { currency })}</span>
            </p>
            <p className="flex justify-between gap-2 text-fg-muted">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-expense" />Uscite</span>
              <span className="text-fg tabular">{formatMoney(activeBar.expenses, { currency })}</span>
            </p>
            <p className="mt-1 flex justify-between gap-2 border-t border-line pt-1 text-fg-muted">
              <span>Netto</span>
              <span className="font-medium text-fg tabular">{formatMoney(activeBar.net, { currency, signDisplay: 'exceptZero' })}</span>
            </p>
            <p className="mt-1 text-fg-subtle">Clic per vedere i movimenti</p>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-2 text-xs text-fg-subtle">Trasferimenti tra conti e versamenti agli investimenti esclusi. Frecce per scorrere, Invio per aprire il mese.</figcaption>
      <details className="mt-2 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">Mostra i dati in tabella</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-control)] border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Entrate e uscite per mese</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Mese</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Entrate</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Uscite</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Netto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bars.map((b) => (
                <tr key={b.month}>
                  <td className="px-3 py-1.5 text-fg-muted capitalize">
                    <a href={href(b)} className="hover:text-accent hover:underline">{monthLabel(b.month, 'long')}</a>
                  </td>
                  <td className="px-3 py-1.5 text-right text-fg tabular">{formatMoney(b.income, { currency })}</td>
                  <td className="px-3 py-1.5 text-right text-fg tabular">{formatMoney(b.expenses, { currency })}</td>
                  <td className="px-3 py-1.5 text-right text-fg tabular">{formatMoney(b.net, { currency, signDisplay: 'exceptZero' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
