import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { goalProgress, linkedAmount, monthsUntil } from '@/lib/goals/progress'

const d = toIsoDate
const TODAY = d('2026-10-09')

describe('progresso degli obiettivi', () => {
  it('manuale: importo inserito, percentuale e mancante', () => {
    const p = goalProgress({ targetCents: 500000, tracking: 'manual', manualCents: 125000, links: [], deadline: null }, TODAY)
    expect(p).toEqual({ current: 125000, remaining: 375000, ratio: 0.25, status: 'active', monthsLeft: null, monthlyNeeded: null })
  })

  it('collegato ai conti: quote dei saldi, i saldi negativi non contano', () => {
    const links = [
      { accountId: 'risparmio', balance: 300000, shareBps: 10000 },
      { accountId: 'revolut', balance: 100000, shareBps: 2500 },
      { accountId: 'carta', balance: -50000, shareBps: 10000 },
    ]
    expect(linkedAmount(links)).toBe(325000)
    expect(goalProgress({ targetCents: 300000, tracking: 'linked_accounts', manualCents: 999, links, deadline: null }, TODAY)).toMatchObject({ current: 325000, remaining: 0, ratio: 1, status: 'achieved' })
  })

  it('con scadenza: quanto serve al mese (arrotondato per eccesso)', () => {
    expect(monthsUntil(TODAY, d('2026-12-31'))).toBe(3)
    expect(monthsUntil(TODAY, d('2026-10-20'))).toBe(1)
    expect(monthsUntil(TODAY, d('2027-10-08'))).toBe(12)
    const p = goalProgress({ targetCents: 100000, tracking: 'manual', manualCents: 0, links: [], deadline: d('2026-12-31') }, TODAY)
    expect(p).toMatchObject({ monthsLeft: 3, monthlyNeeded: 33334, status: 'active' })
  })

  it('scadenza passata senza traguardo: in ritardo, nessun importo mensile', () => {
    expect(goalProgress({ targetCents: 100000, tracking: 'manual', manualCents: 10, links: [], deadline: d('2026-09-30') }, TODAY)).toMatchObject({ status: 'overdue', monthsLeft: null, monthlyNeeded: null })
  })
})
