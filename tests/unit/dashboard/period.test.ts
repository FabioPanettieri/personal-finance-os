import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { addMonths, monthsInRange, periodSearch, precedingRange, resolvePeriod } from '@/lib/dashboard/period'

const TODAY = toIsoDate('2026-10-15')
const FIRST = toIsoDate('2025-03-10')
const range = (p: { from: string; to: string } | null) => (p ? [p.from, p.to] : null)

describe('periodi della dashboard', () => {
  it('questo mese: dal primo a oggi, confronto con lo stesso tratto del mese precedente', () => {
    const p = resolvePeriod({}, TODAY, FIRST)
    expect(p.preset).toBe('this-month')
    expect(range(p)).toEqual(['2026-10-01', '2026-10-15'])
    expect(range(p.previous)).toEqual(['2026-09-01', '2026-09-15'])
  })

  it('mese scorso: mese intero contro il mese prima', () => {
    const p = resolvePeriod({ period: 'last-month' }, TODAY, FIRST)
    expect(range(p)).toEqual(['2026-09-01', '2026-09-30'])
    expect(range(p.previous)).toEqual(['2026-08-01', '2026-08-31'])
  })

  it('ultimi 3 e 6 mesi (trimestre e semestre), mese corrente incluso', () => {
    expect(range(resolvePeriod({ period: '3m' }, TODAY, FIRST))).toEqual(['2026-08-01', '2026-10-15'])
    expect(range(resolvePeriod({ period: '3m' }, TODAY, FIRST).previous)).toEqual(['2026-05-01', '2026-07-15'])
    expect(range(resolvePeriod({ period: '6m' }, TODAY, FIRST))).toEqual(['2026-05-01', '2026-10-15'])
  })

  it('anno corrente e anno precedente', () => {
    const ytd = resolvePeriod({ period: 'ytd' }, TODAY, FIRST)
    expect(range(ytd)).toEqual(['2026-01-01', '2026-10-15'])
    expect(range(ytd.previous)).toEqual(['2025-01-01', '2025-10-15'])
    const last = resolvePeriod({ period: 'last-year' }, TODAY, FIRST)
    expect(range(last)).toEqual(['2025-01-01', '2025-12-31'])
    expect(range(last.previous)).toEqual(['2024-01-01', '2024-12-31'])
  })

  it('tutto: dal primo dato, senza confronto; senza dati parte da oggi', () => {
    const all = resolvePeriod({ period: 'all' }, TODAY, FIRST)
    expect(range(all)).toEqual(['2025-03-10', '2026-10-15'])
    expect(all.previous).toBeNull()
    expect(range(resolvePeriod({ period: 'all' }, TODAY, null))).toEqual(['2026-10-15', '2026-10-15'])
  })

  it('personalizzato: periodo precedente di pari durata; date non valide → questo mese', () => {
    const c = resolvePeriod({ period: 'custom', from: '2026-09-01', to: '2026-09-30' }, TODAY, FIRST)
    expect(range(c)).toEqual(['2026-09-01', '2026-09-30'])
    expect(range(c.previous)).toEqual(['2026-08-02', '2026-08-31'])
    expect(resolvePeriod({ period: 'custom', from: '2026-09-30', to: '2026-09-01' }, TODAY, FIRST).preset).toBe('this-month')
    expect(resolvePeriod({ period: 'custom', from: 'x', to: '2026-09-01' }, TODAY, FIRST).preset).toBe('this-month')
    expect(resolvePeriod({ period: 'boh' }, TODAY, FIRST).preset).toBe('this-month')
  })

  it('fine mese e anni bisestili', () => {
    expect(addMonths(toIsoDate('2026-03-31'), -1)).toBe('2026-02-28')
    expect(addMonths(toIsoDate('2028-03-31'), -1)).toBe('2028-02-29')
    expect(addMonths(toIsoDate('2026-01-15'), -13)).toBe('2024-12-15')
    const p = resolvePeriod({}, toIsoDate('2026-03-31'), FIRST)
    expect(range(p.previous)).toEqual(['2026-02-01', '2026-02-28'])
    expect(precedingRange({ from: toIsoDate('2026-03-01'), to: toIsoDate('2026-03-01') })).toEqual({ from: '2026-02-28', to: '2026-02-28' })
  })

  it('mesi del periodo e query string', () => {
    expect(monthsInRange({ from: toIsoDate('2026-08-20'), to: toIsoDate('2026-10-02') })).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
    expect(periodSearch({ preset: 'this-month', from: TODAY, to: TODAY })).toBe('')
    expect(periodSearch({ preset: 'ytd', from: TODAY, to: TODAY })).toBe('period=ytd')
    expect(periodSearch({ preset: 'custom', from: toIsoDate('2026-01-01'), to: TODAY })).toBe('period=custom&from=2026-01-01&to=2026-10-15')
  })
})
