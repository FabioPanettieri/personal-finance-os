import { describe, expect, it } from 'vitest'

import { dayNumber, linearScale, niceTicks } from '@/lib/charts/scale'

describe('niceTicks', () => {
  it('produce tick puliti che coprono i dati', () => {
    const { ticks, domain } = niceTicks(123, 987, 4)
    expect(ticks).toEqual([0, 250, 500, 750, 1000])
    expect(domain).toEqual([0, 1000])
  })

  it('gestisce valori negativi (saldo sotto zero)', () => {
    const { ticks } = niceTicks(-1200, 3400, 4)
    expect(ticks[0]).toBeLessThanOrEqual(-1200)
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(3400)
    expect(ticks).toContain(0)
  })

  it('serie piatta: allarga il dominio invece di dividere per zero', () => {
    const { domain } = niceTicks(5000, 5000, 4)
    expect(domain[0]).toBeLessThan(5000)
    expect(domain[1]).toBeGreaterThan(5000)
  })
})

describe('linearScale e dayNumber', () => {
  it('mappa il dominio sul range', () => {
    const scale = linearScale([0, 10], [100, 200])
    expect(scale(0)).toBe(100)
    expect(scale(5)).toBe(150)
    expect(scale(10)).toBe(200)
  })

  it('dominio degenere: centro del range', () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50)
  })

  it('giorni consecutivi distano 1 anche col cambio d’ora legale', () => {
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1)
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1)
  })
})
