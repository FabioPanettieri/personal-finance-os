import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { createPlan, deletePlan, listPlans, savePrice, setPlanActive } from '@/server/repositories/investments'
import { loadInvestments } from '@/server/services/investments'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 8 — investimenti sullo stack locale (RLS + AAL2), dati sintetici. Acceptance: versamento ≠ rendimento. */
const TODAY = toIsoDate('2026-10-09')

let a: TestUser
let b: TestUser
let tr: string
let etf: string

async function cash(key: string, day: string, amount: number, type: 'investment' | 'income' | 'expense', description: string) {
  const { error } = await admin.from('transactions').insert({
    user_id: a.id,
    account_id: tr,
    booked_on: day,
    description,
    original_description: description.toUpperCase(),
    amount_cents: amount,
    type,
    nature: type === 'investment' ? 'investment' : 'personal',
    source: 'manual',
    is_categorized: true,
    categorization_method: 'manual',
    fingerprint: key.padStart(64, '0'),
  })
  if (error) throw error
}

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('invest-a'), createTestUser('invest-b')])
  tr = (await admin.from('accounts').select('id').eq('user_id', a.id).eq('name', 'Trade Republic').single()).data!.id
  const { data: instrument, error } = await admin
    .from('instruments')
    .insert({ user_id: a.id, isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World' })
    .select('id')
    .single()
  if (error) throw error
  etf = instrument.id
  await cash('a1', '2026-09-01', 100000, 'investment', 'Versamento')
  await cash('a2', '2026-09-20', 1000, 'income', 'Dividendo')
  await cash('a3', '2026-09-02', -100, 'expense', 'Commissione')
  const { error: e } = await admin.from('investment_transactions').insert({
    user_id: a.id,
    account_id: tr,
    instrument_id: etf,
    trade_on: '2026-09-02',
    kind: 'buy',
    quantity: 10,
    price: 90,
    amount_cents: -90000,
    source: 'manual',
    fingerprint: 'b1'.padStart(64, '0'),
  })
  if (e) throw e
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

const broker = async (user: TestUser) => (await loadInvestments(user.client, TODAY)).find((x) => x.account.name === 'Trade Republic')!

describe('portafoglio Trade Republic', () => {
  it('senza prezzo: titoli al costo, rendimento = dividendi − commissioni', async () => {
    const { summary, positions } = await broker(a)
    expect(summary).toMatchObject({ netDeposits: 100000, liquidity: 10900, securitiesValue: 90000, value: 100900, gain: 900, income: 1000, costs: 100, unpriced: 1 })
    expect(positions[0]).toMatchObject({ quantity: 10, costCents: 90000, marketValueCents: null, instrument: { name: 'iShares Core MSCI World' } })
  })

  it('con il prezzo di oggi: valore = quote × prezzo', async () => {
    expect(await savePrice(a.client, { accountId: tr, instrumentId: etf, unitPrice: 95, quantity: 10, valuedOn: TODAY })).toEqual({ ok: true })
    // Stesso giorno: aggiorna, non duplica.
    expect(await savePrice(a.client, { accountId: tr, instrumentId: etf, unitPrice: 95.5, quantity: 10, valuedOn: TODAY })).toEqual({ ok: true })
    const { count } = await admin.from('investment_valuations').select('id', { count: 'exact', head: true }).eq('account_id', tr)
    expect(count).toBe(1)
    const { summary } = await broker(a)
    expect(summary).toMatchObject({ securitiesValue: 95500, value: 106400, gain: 6400, unrealized: 5500, unpriced: 0 })
  })

  it('versamento ≠ rendimento: un nuovo versamento non cambia il rendimento', async () => {
    const before = (await broker(a)).summary
    await cash('a4', '2026-10-01', 50000, 'investment', 'Versamento ottobre')
    const after = (await broker(a)).summary
    expect(after.gain).toBe(before.gain)
    expect(after.value - before.value).toBe(50000)
    expect(after.netDeposits - before.netDeposits).toBe(50000)
  })
})

describe('piani di accumulo', () => {
  it('crea, mette in pausa, elimina', async () => {
    expect(await createPlan(a.client, { accountId: tr, instrumentId: etf, name: 'PAC World', amountCents: 15000, frequency: 'monthly', startsOn: toIsoDate('2026-10-15') })).toEqual({ ok: true })
    const view = await broker(a)
    expect(view.plans).toHaveLength(1)
    expect(view.plans[0]).toMatchObject({ name: 'PAC World', next: '2026-10-15', monthly: 15000, instrumentName: 'iShares Core MSCI World' })
    expect(view.monthlyPlanned).toBe(15000)

    const id = view.plans[0]!.id
    expect(await setPlanActive(a.client, id, false)).toBe(true)
    expect((await broker(a)).monthlyPlanned).toBe(0)
    expect(await deletePlan(a.client, id)).toBe(true)
    expect(await listPlans(a.client, tr)).toEqual([])
  })
})

describe('isolamento', () => {
  it('un altro utente non vede né modifica', async () => {
    const other = await broker(b)
    expect(other.positions).toEqual([])
    expect(other.summary.value).toBe(0)
    expect(await savePrice(b.client, { accountId: tr, instrumentId: etf, unitPrice: 1, quantity: 10, valuedOn: TODAY })).toMatchObject({ ok: false })
    expect(await createPlan(b.client, { accountId: tr, instrumentId: null, name: 'x', amountCents: 100, frequency: 'monthly', startsOn: TODAY })).toMatchObject({ ok: false })
  })
})
