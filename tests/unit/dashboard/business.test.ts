import { describe, expect, it } from 'vitest'

import { businessMonths, splitTotals, type SplitRow } from '@/lib/dashboard/business'
import { toIsoDate } from '@/lib/dates'

describe('personale vs business', () => {
  const rows: SplitRow[] = [
    { scope: 'personal', currency: 'EUR', incomeCents: 200000, expenseCents: 80000, refundCents: 2000, count: 10 },
    { scope: 'business', currency: 'EUR', incomeCents: 12000, expenseCents: 1250, refundCents: 0, count: 3 },
    { scope: 'business', currency: 'USD', incomeCents: 99999, expenseCents: 0, refundCents: 0, count: 1 },
  ]

  it('somma per gruppo, spese al netto dei rimborsi, una sola valuta', () => {
    const s = splitTotals(rows)
    expect(s.personal).toEqual({ income: 200000, expenses: 78000, net: 122000, count: 10 })
    expect(s.business).toEqual({ income: 12000, expenses: 1250, net: 10750, count: 3 })
  })

  it('personale + business = totale (nessuna doppia conta)', () => {
    const s = splitTotals(rows)
    expect(s.total.income).toBe(s.personal.income + s.business.income)
    expect(s.total.expenses).toBe(s.personal.expenses + s.business.expenses)
    expect(s.total.count).toBe(13)
  })

  it('senza movimenti: zero, non undefined', () => {
    expect(splitTotals([]).business).toEqual({ income: 0, expenses: 0, net: 0, count: 0 })
  })
})

describe('andamento mensile del business', () => {
  it('un punto per mese, anche vuoto; utile = incassi − spese', () => {
    const months = [toIsoDate('2026-07-01'), toIsoDate('2026-08-01'), toIsoDate('2026-09-01')]
    const result = businessMonths(
      [
        { month: toIsoDate('2026-07-01'), currency: 'EUR', revenueCents: 5000, expenseCents: 7000, count: 2 },
        { month: toIsoDate('2026-09-01'), currency: 'EUR', revenueCents: 12000, expenseCents: 1250, count: 3 },
        { month: toIsoDate('2026-09-01'), currency: 'USD', revenueCents: 1, expenseCents: 0, count: 1 },
      ],
      months,
    )
    expect(result).toEqual([
      { month: '2026-07-01', revenue: 5000, expenses: 7000, profit: -2000, count: 2 },
      { month: '2026-08-01', revenue: 0, expenses: 0, profit: 0, count: 0 },
      { month: '2026-09-01', revenue: 12000, expenses: 1250, profit: 10750, count: 3 },
    ])
  })
})
