import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import {
  businessMargin,
  businessPerformance,
  comparisonRatio,
  incomeBySource,
  monthlyBars,
  netWorthBreakdown,
  netWorthSeries,
  spendingByCategory,
  sumFlows,
  type BalanceAccount,
  type MonthlyFlowRow,
} from '@/lib/dashboard/metrics'
import { cents } from '@/lib/money'

const acc = (id: string, balance: number, kind: BalanceAccount['kind'], typeCode: string, currency = 'EUR'): BalanceAccount => ({
  id,
  name: id,
  currency,
  balance: cents(balance),
  kind,
  typeCode,
})

describe('patrimonio netto e liquidità', () => {
  it('broker: liquidità + titoli al costo senza doppio conteggio; carta esclusa dalla liquidità', () => {
    const b = netWorthBreakdown(
      [acc('ing', 100000, 'liquid', 'checking'), acc('sav', 50000, 'liquid', 'savings'), acc('card', -30000, 'liquid', 'card'), acc('tr', 20000, 'investment', 'broker'), acc('usd', 999, 'liquid', 'checking', 'USD')],
      new Map([['tr', cents(15000)]]),
    )
    expect(b).toEqual({ netWorth: 140000, liquidity: 155000, investedAtCost: 15000, cards: -30000, other: 0 })
    // La somma dei pezzi è sempre il totale dei saldi in euro.
    expect(b.liquidity + b.investedAtCost + b.cards + b.other).toBe(100000 + 50000 - 30000 + 20000)
  })

  it('nessun conto: tutto zero', () => {
    expect(netWorthBreakdown([], new Map())).toEqual({ netWorth: 0, liquidity: 0, investedAtCost: 0, cards: 0, other: 0 })
  })
})

describe('flussi', () => {
  const rows: MonthlyFlowRow[] = [
    { month: toIsoDate('2026-09-01'), currency: 'EUR', incomeCents: 200000, expenseCents: 50000, refundCents: 2000, incomeCount: 2, expenseCount: 5 },
    { month: toIsoDate('2026-10-01'), currency: 'EUR', incomeCents: 0, expenseCents: 1000, refundCents: 0, incomeCount: 0, expenseCount: 1 },
    { month: toIsoDate('2026-10-01'), currency: 'USD', incomeCents: 5000, expenseCents: 0, refundCents: 0, incomeCount: 1, expenseCount: 0 },
  ]
  it('uscite al netto dei rimborsi, cash flow = entrate − uscite, valute separate', () => {
    expect(sumFlows(rows)).toEqual({ income: 200000, expenses: 49000, cashFlow: 151000, incomeCount: 2, expenseCount: 6 })
  })
  it('una barra per mese anche senza movimenti', () => {
    const bars = monthlyBars(rows, [toIsoDate('2026-08-01'), toIsoDate('2026-09-01'), toIsoDate('2026-10-01')])
    expect(bars.map((b) => [b.month, b.income, b.expenses])).toEqual([
      ['2026-08-01', 0, 0],
      ['2026-09-01', 200000, 48000],
      ['2026-10-01', 0, 1000],
    ])
  })
})

describe('confronto', () => {
  const prev = { from: toIsoDate('2026-08-01'), to: toIsoDate('2026-08-31') }
  it('percentuale solo con periodo precedente coperto e denominatore ≠ 0', () => {
    expect(comparisonRatio(110, 100, prev, toIsoDate('2026-01-01'))).toBeCloseTo(0.1)
    expect(comparisonRatio(-50, -100, prev, toIsoDate('2026-01-01'))).toBeCloseTo(0.5)
    expect(comparisonRatio(110, 0, prev, toIsoDate('2026-01-01'))).toBeNull()
    expect(comparisonRatio(110, 100, prev, toIsoDate('2026-08-15'))).toBeNull()
    expect(comparisonRatio(110, 100, prev, null)).toBeNull()
    expect(comparisonRatio(110, 100, null, toIsoDate('2026-01-01'))).toBeNull()
  })
})

describe('spese per categoria', () => {
  const tree = [
    { id: 'casa', name: 'Casa', parentId: null, color: '#000000' },
    { id: 'mutuo', name: 'Mutuo', parentId: 'casa', color: null },
    { id: 'bollette', name: 'Bollette', parentId: 'casa', color: null },
    { id: 'shop', name: 'Shopping', parentId: null, color: null },
  ]
  it('sottocategorie nel padre, quota sul totale positivo, senza categoria a parte', () => {
    const slices = spendingByCategory(
      [
        { categoryId: 'mutuo', currency: 'EUR', spentCents: 60000, count: 1 },
        { categoryId: 'bollette', currency: 'EUR', spentCents: 12000, count: 1 },
        { categoryId: 'shop', currency: 'EUR', spentCents: -2000, count: 1 },
        { categoryId: null, currency: 'EUR', spentCents: 8000, count: 2 },
      ],
      tree,
    )
    expect(slices.map((s) => [s.label, s.amount, s.count])).toEqual([
      ['Casa', 72000, 2],
      ['Senza categoria', 8000, 2],
      ['Shopping', -2000, 1],
    ])
    expect(slices[0]!.share).toBeCloseTo(0.9)
    expect(slices[0]!.categoryIds).toEqual(['casa', 'mutuo', 'bollette'])
    expect(slices[2]!.share).toBe(0)
  })
  it('nessuna spesa: lista vuota', () => {
    expect(spendingByCategory([], tree)).toEqual([])
  })
})

describe('fonti di reddito e business', () => {
  it('fonti dal database, entrate senza fonte a parte', () => {
    const s = incomeBySource(
      [
        { incomeSourceId: 'sal', currency: 'EUR', incomeCents: 165000, count: 1 },
        { incomeSourceId: null, currency: 'EUR', incomeCents: 5000, count: 1 },
      ],
      [{ id: 'sal', name: 'Stipendio' }],
    )
    expect(s.map((x) => [x.label, x.amount])).toEqual([
      ['Stipendio', 165000],
      ['Senza fonte', 5000],
    ])
  })

  it('utile = ricavi − spese business; margine N/D con ricavi zero', () => {
    expect(businessMargin(0, -500)).toBeNull()
    expect(businessMargin(1000, 250)).toBe(0.25)
    const list = businessPerformance(
      [
        { businessId: 'v', currency: 'EUR', revenueCents: 12000, expenseCents: 1250, count: 2 },
        { businessId: 'y', currency: 'EUR', revenueCents: 0, expenseCents: 3000, count: 1 },
      ],
      [
        { id: 'v', name: 'VOXEL Studio' },
        { id: 'y', name: 'YouTube' },
        { id: 'a', name: 'Altro' },
      ],
    )
    expect(list.map((b) => [b.name, b.revenue, b.expenses, b.profit, b.margin])).toEqual([
      ['VOXEL Studio', 12000, 1250, 10750, 10750 / 12000],
      ['YouTube', 0, 3000, -3000, null],
      ['Altro', 0, 0, 0, null],
    ])
  })
})

describe('storico del patrimonio', () => {
  const h = [
    { date: toIsoDate('2026-07-05'), balance: cents(-12000) },
    { date: toIsoDate('2026-08-01'), balance: cents(50000) },
    { date: toIsoDate('2026-09-10'), balance: cents(80000) },
  ]
  const today = toIsoDate('2026-10-03')
  it('inizio intervallo = ultimo valore noto, estensione fino a oggi', () => {
    expect(netWorthSeries(h, toIsoDate('2026-08-15'), today)).toEqual([
      { date: '2026-08-15', balance: 50000 },
      { date: '2026-09-10', balance: 80000 },
      { date: '2026-10-03', balance: 80000 },
    ])
  })
  it('nessun punto prima del primo dato', () => {
    expect(netWorthSeries(h, toIsoDate('2020-01-01'), today)[0]).toEqual({ date: '2026-07-05', balance: -12000 })
    expect(netWorthSeries(h, null, today)).toHaveLength(4)
  })
  it('intervallo senza movimenti: valore costante; storico vuoto → nessun punto', () => {
    expect(netWorthSeries(h, toIsoDate('2026-09-20'), today)).toEqual([
      { date: '2026-09-20', balance: 80000 },
      { date: '2026-10-03', balance: 80000 },
    ])
    expect(netWorthSeries([], null, today)).toEqual([])
  })
})
