import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { computePositions, monthlyEquivalent, nextExecution, summarizePortfolio, valuePositions, type Trade } from '@/lib/investments/portfolio'

const d = toIsoDate
const buy = (day: string, quantity: number, cost: number, instrumentId = 'etf'): Trade => ({ instrumentId, tradeOn: d(day), kind: 'buy', quantity, amountCents: -cost })
const sell = (day: string, quantity: number, proceeds: number, instrumentId = 'etf'): Trade => ({ instrumentId, tradeOn: d(day), kind: 'sell', quantity, amountCents: proceeds })

describe('posizioni a costo medio', () => {
  it('acquisti cumulati, vendita al costo medio, guadagno realizzato', () => {
    const [p] = computePositions([buy('2026-01-10', 10, 100000), buy('2026-02-10', 10, 120000), sell('2026-03-10', 5, 70000)])
    // costo medio 11.000 per quota: 5 quote vendute costano 55.000.
    expect(p).toEqual({ instrumentId: 'etf', quantity: 15, costCents: 165000, realizedCents: 15000, trades: 3 })
  })

  it('vendita totale azzera quantità e costo', () => {
    const [p] = computePositions([buy('2026-01-10', 2.5, 25000), sell('2026-02-10', 2.5, 30000)])
    expect(p).toMatchObject({ quantity: 0, costCents: 0, realizedCents: 5000 })
  })
})

describe('valore e rendimento', () => {
  const trades = [buy('2026-01-10', 10, 90000)]
  const priced = valuePositions(computePositions(trades), [
    { instrumentId: 'etf', unitPrice: 90, valuedOn: d('2026-02-01') },
    { instrumentId: 'etf', unitPrice: 95, valuedOn: d('2026-03-01') },
  ])

  it('usa l’ultimo prezzo: quantità × prezzo', () => {
    expect(priced[0]).toMatchObject({ marketValueCents: 95000, unrealizedCents: 5000, price: { unitPrice: 95 } })
  })

  it('rendimento = valore − versato (con dividendi e commissioni nel saldo)', () => {
    // Versati 1.000 €, acquisto 900 €, dividendo 10 €, commissione 1 €: saldo 1.009 €.
    const s = summarizePortfolio({ balanceCents: 100900, netDepositsCents: 100000, incomeCents: 1000, costsCents: 100, trades, positions: priced })
    expect(s).toMatchObject({ liquidity: 10900, securitiesValue: 95000, value: 105900, gain: 5900, unrealized: 5000, unpriced: 0 })
    expect(s.gainRatio).toBeCloseTo(0.059)
  })

  it('versamento ≠ rendimento: un nuovo versamento non cambia il rendimento', () => {
    const before = summarizePortfolio({ balanceCents: 100900, netDepositsCents: 100000, incomeCents: 0, costsCents: 0, trades, positions: priced })
    const after = summarizePortfolio({ balanceCents: 150900, netDepositsCents: 150000, incomeCents: 0, costsCents: 0, trades, positions: priced })
    expect(after.gain).toBe(before.gain)
    expect(after.value - before.value).toBe(50000)
    expect(after.netDeposits - before.netDeposits).toBe(50000)
  })

  it('senza prezzo i titoli valgono al costo e lo dice', () => {
    const unpriced = valuePositions(computePositions(trades), [])
    const s = summarizePortfolio({ balanceCents: 100000, netDepositsCents: 100000, incomeCents: 0, costsCents: 0, trades, positions: unpriced })
    expect(s).toMatchObject({ securitiesValue: 90000, value: 100000, gain: 0, unpriced: 1 })
    expect(unpriced[0]!.marketValueCents).toBeNull()
  })

  it('niente percentuale se il versato non è positivo', () => {
    expect(summarizePortfolio({ balanceCents: 0, netDepositsCents: 0, incomeCents: 0, costsCents: 0, trades: [], positions: [] }).gainRatio).toBeNull()
  })
})

describe('PAC', () => {
  it('quota mensile equivalente', () => {
    expect(monthlyEquivalent(10000, 'monthly')).toBe(10000)
    expect(monthlyEquivalent(3000, 'weekly')).toBe(13000)
    expect(monthlyEquivalent(6000, 'biweekly')).toBe(13000)
    expect(monthlyEquivalent(30000, 'quarterly')).toBe(10000)
  })

  it('prossima esecuzione mensile, con fine mese e data di fine', () => {
    const plan = { frequency: 'monthly' as const, startsOn: d('2026-01-31'), endsOn: null, dayOfMonth: 31 }
    expect(nextExecution(plan, d('2026-02-10'))).toBe('2026-02-28')
    expect(nextExecution(plan, d('2026-03-31'))).toBe('2026-03-31')
    expect(nextExecution({ ...plan, endsOn: d('2026-03-01') }, d('2026-03-02'))).toBeNull()
  })

  it('prossima esecuzione settimanale e trimestrale', () => {
    expect(nextExecution({ frequency: 'weekly', startsOn: d('2026-10-01'), endsOn: null, dayOfMonth: null }, d('2026-10-09'))).toBe('2026-10-15')
    expect(nextExecution({ frequency: 'quarterly', startsOn: d('2026-01-02'), endsOn: null, dayOfMonth: 2 }, d('2026-05-01'))).toBe('2026-07-02')
    expect(nextExecution({ frequency: 'monthly', startsOn: d('2026-12-01'), endsOn: null, dayOfMonth: 1 }, d('2026-10-09'))).toBe('2026-12-01')
  })
})
