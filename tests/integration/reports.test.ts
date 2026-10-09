import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { loadDashboard } from '@/server/services/dashboard'
import { loadReport } from '@/server/services/reports'

import { EXPECTED, seedDashboard } from '../support/dashboard-seed'
import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 9 — report sullo stack locale (RLS + AAL2), dati sintetici. Acceptance: osservazioni solo dai dati. */
const TODAY = toIsoDate('2026-10-03')

let a: TestUser
let b: TestUser

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('reports-a'), createTestUser('reports-b')])
  await seedDashboard(admin, a.id)
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('report del mese', () => {
  it('stessi numeri della Home per lo stesso periodo', async () => {
    const r = await loadReport(a.client, { kind: 'month', at: '2026-09' }, TODAY)
    const d = await loadDashboard(a.client, { period: 'custom', from: '2026-09-01', to: '2026-09-30' }, TODAY)
    expect(r.period.label).toBe('Settembre 2026')
    expect(r.flows).toMatchObject(EXPECTED.september)
    expect(r.flows).toEqual(d.flows)
    expect(r.split.total.income).toBe(r.flows.income)
    expect(r.netWorth.end).toBe(d.history.filter((p) => p.date <= '2026-09-30').at(-1)?.balance)
  })

  it('osservazioni con i numeri del periodo', async () => {
    const r = await loadReport(a.client, { kind: 'month', at: '2026-09' }, TODAY)
    const byKey = Object.fromEntries(r.insights.map((i) => [i.key, i.text.replace(/[  ]/g, ' ')]))
    const saved = EXPECTED.september.income - EXPECTED.september.expenses
    expect(byKey.saved).toContain(new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(saved / 100).replace(/[  ]/g, ' '))
    expect(byKey.biggest).toMatch(/^Spesa più grande: /)
    expect(r.insights.every((i) => /\d/.test(i.text))).toBe(true)
  })
})

describe('report dell’anno', () => {
  it('mese per mese: la somma dei mesi è il totale dell’anno; storico del patrimonio', async () => {
    const r = await loadReport(a.client, { kind: 'year', at: '2026' }, TODAY)
    expect(r.months).toHaveLength(12)
    expect(r.months!.reduce((s, m) => s + m.income, 0)).toBe(r.flows.income)
    expect(r.months!.reduce((s, m) => s + m.expenses, 0)).toBe(r.flows.expenses)
    expect(r.history.at(-1)).toMatchObject({ year: 2026, value: EXPECTED.netWorth, ongoing: true })
  })
})

describe('nessun dato', () => {
  it('un altro utente: una sola osservazione, nessun numero', async () => {
    const r = await loadReport(b.client, { kind: 'month', at: '2026-09' }, TODAY)
    expect(r.insights).toEqual([{ key: 'empty', tone: 'neutral', text: 'Nessun movimento in questo periodo.' }])
    expect(r.flows.income).toBe(0)
    expect(r.netWorth).toEqual({ start: null, end: null })
  })
})
