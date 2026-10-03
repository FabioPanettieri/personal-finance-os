/**
 * Scale e tick per grafici SVG semplici. Pura geometria: nessun DOM.
 */

const DAY_MS = 86_400_000

/** Giorno ordinale di una data YYYY-MM-DD (UTC, nessun effetto del fuso). */
export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d) / DAY_MS
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))
}

function niceStep(rawStep: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const fraction = rawStep / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

/**
 * Tick "puliti" (1, 2, 2.5, 5 × 10^n) che coprono [min, max]. Restituisce
 * anche il dominio arrotondato ai tick, da usare per la scala.
 */
export function niceTicks(min: number, max: number, targetCount = 4): { ticks: number[]; domain: [number, number] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0], domain: [0, 1] }
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1
    return niceTicks(min - pad, max + pad, targetCount)
  }
  const step = niceStep((max - min) / Math.max(1, targetCount))
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value / step) * step)
  }
  return { ticks, domain: [start, end] }
}
