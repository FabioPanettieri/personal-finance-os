'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { dayNumber, linearScale, niceTicks } from '@/lib/charts/scale'
import { formatIsoDate, type IsoDate } from '@/lib/dates'
import { formatMoney, type Cents } from '@/lib/money'

export type BalanceChartPoint = { date: IsoDate; balance: Cents }

const HEIGHT = 240
const MARGIN = { top: 16, right: 16, bottom: 28, left: 64 }

/**
 * Andamento del saldo a fine giornata. Linea a gradini: il saldo cambia solo
 * nei giorni con movimenti, quindi nessuna interpolazione inventata tra un
 * punto e l'altro. Mirino + tooltip al passaggio (o con le frecce da
 * tastiera) e tabella dei dati sempre disponibile.
 */
export function BalanceChart({ points, currency, label }: { points: BalanceChartPoint[]; currency: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const descriptionId = useId()

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
    const xs = points.map((p) => dayNumber(p.date))
    const values = points.map((p) => p.balance)
    const { ticks, domain } = niceTicks(Math.min(...values), Math.max(...values), 4)
    const x = linearScale([xs[0] ?? 0, xs.at(-1) ?? 1], [MARGIN.left, width - MARGIN.right])
    const y = linearScale(domain, [HEIGHT - MARGIN.bottom, MARGIN.top])

    // Gradino: orizzontale fino al giorno successivo, poi verticale.
    let line = ''
    points.forEach((p, i) => {
      const px = x(xs[i]!)
      const py = y(p.balance)
      line += i === 0 ? `M${px},${py}` : `H${px}V${py}`
    })
    const baseline = y(Math.max(domain[0], Math.min(0, domain[1])))
    const lastX = x(xs.at(-1)!)
    const area = `${line}V${baseline}H${x(xs[0]!)}Z`

    const firstDate = points[0]!.date
    const lastDate = points.at(-1)!.date
    return { xs, x, y, ticks, line, area, lastX, firstDate, lastDate }
  }, [points, width])

  const activePoint = active === null ? null : points[active]
  const last = points.at(-1)!

  function nearestIndex(clientX: number, rect: DOMRect): number {
    const px = clientX - rect.left
    let best = 0
    let bestDistance = Infinity
    geometry.xs.forEach((day, i) => {
      const distance = Math.abs(geometry.x(day) - px)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    })
    return best
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    setActive(nearestIndex(event.clientX, event.currentTarget.getBoundingClientRect()))
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const step = event.key === 'ArrowRight' ? 1 : -1
      setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : points.length)) + step)))
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  const tooltipLeft = activePoint ? geometry.x(geometry.xs[active!]!) : 0

  return (
    <figure className="m-0">
      <div ref={containerRef} className="relative">
        <svg
          role="img"
          aria-label={label}
          aria-describedby={descriptionId}
          tabIndex={0}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-auto w-full touch-pan-y rounded-md outline-offset-4 select-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {geometry.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={geometry.y(tick)}
                y2={geometry.y(tick)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={geometry.y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-fg-subtle text-[11px] tabular"
              >
                {formatMoney(tick as Cents, { currency, compact: true })}
              </text>
            </g>
          ))}
          <text x={MARGIN.left} y={HEIGHT - 8} className="fill-fg-subtle text-[11px]">
            {formatIsoDate(geometry.firstDate)}
          </text>
          <text x={width - MARGIN.right} y={HEIGHT - 8} textAnchor="end" className="fill-fg-subtle text-[11px]">
            {formatIsoDate(geometry.lastDate)}
          </text>

          <path d={geometry.area} fill="var(--accent)" fillOpacity={0.1} />
          <path d={geometry.line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={geometry.lastX} cy={geometry.y(last.balance)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />

          {activePoint ? (
            <g pointerEvents="none">
              <line
                x1={tooltipLeft}
                x2={tooltipLeft}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                stroke="var(--fg-subtle)"
                strokeWidth={1}
              />
              <circle cx={tooltipLeft} cy={geometry.y(activePoint.balance)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>

        {activePoint ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-card)]"
            style={{
              left: Math.min(Math.max(tooltipLeft - 80, 0), width - 160),
              width: 160,
            }}
          >
            <p className="text-fg-muted">{formatIsoDate(activePoint.date, 'long')}</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-fg tabular">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded bg-accent" />
              {formatMoney(activePoint.balance, { currency })}
            </p>
          </div>
        ) : null}
      </div>

      <figcaption id={descriptionId} className="mt-2 text-xs text-fg-subtle">
        Saldo a fine giornata nei giorni con movimenti ({points.length} punti). Usa le frecce per scorrere i valori.
      </figcaption>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-fg-muted hover:text-fg">Mostra i dati in tabella</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-control)] border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Data</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1.5 text-fg-muted">{formatIsoDate(p.date, 'numeric')}</td>
                  <td className="px-3 py-1.5 text-right text-fg tabular">{formatMoney(p.balance, { currency })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
