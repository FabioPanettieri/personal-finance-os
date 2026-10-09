import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { businessMonths, splitTotals } from '@/lib/dashboard/business'
import { toIsoDate } from '@/lib/dates'
import { businessCategorySpending, businessMonthly, personalBusinessSplit } from '@/server/repositories/business'
import { updateTransactionDetails } from '@/server/repositories/transactions'
import { loadDashboard } from '@/server/services/dashboard'

import { EXPECTED, seedDashboard } from '../support/dashboard-seed'
import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 7 — personale vs business sullo stack locale (RLS + AAL2), dati sintetici. Acceptance: nessuna doppia conta. */
const SEPTEMBER = { from: toIsoDate('2026-09-01'), to: toIsoDate('2026-09-30') }
const TODAY = toIsoDate('2026-10-03')

let a: TestUser
let b: TestUser
let voxel: string
let youtube: string

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('business-a'), createTestUser('business-b')])
  await seedDashboard(admin, a.id)
  const { data } = await admin.from('businesses').select('id, slug').eq('user_id', a.id)
  voxel = data!.find((x) => x.slug === 'voxel-studio')!.id
  youtube = data!.find((x) => x.slug === 'il-progettista-meccanico')!.id
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('personale vs business', () => {
  it('personale + business = entrate e uscite della dashboard', async () => {
    const split = splitTotals(await personalBusinessSplit(a.client, SEPTEMBER))
    expect(split.business).toMatchObject({ income: 36500, expenses: 1250 })
    expect(split.personal.income).toBe(EXPECTED.september.income - 36500)
    expect(split.personal.expenses).toBe(EXPECTED.september.expenses - 1250)

    const d = await loadDashboard(a.client, { period: 'custom', ...SEPTEMBER }, TODAY)
    expect(split.total.income).toBe(d.flows.income)
    expect(split.total.expenses).toBe(d.flows.expenses)
  })

  it('andamento mensile e spese per categoria coincidono con il riepilogo del business', async () => {
    const d = await loadDashboard(a.client, { period: 'custom', ...SEPTEMBER }, TODAY)
    const card = d.businesses.find((x) => x.businessId === voxel)!
    const months = businessMonths(await businessMonthly(a.client, voxel, SEPTEMBER), [SEPTEMBER.from])
    expect(months[0]).toMatchObject({ revenue: card.revenue, expenses: card.expenses, profit: card.profit })
    const categories = await businessCategorySpending(a.client, voxel, SEPTEMBER)
    expect(categories.reduce((s, c) => s + c.spentCents, 0)).toBe(card.expenses)
  })

  it('assegnare un business sposta la spesa da personale a business, il totale non cambia', async () => {
    const before = splitTotals(await personalBusinessSplit(a.client, SEPTEMBER))
    const { data: tx } = await admin.from('transactions').select('id, description, amount_cents').eq('user_id', a.id).eq('description', 'Ristorante').single()
    expect(await updateTransactionDetails(a.client, tx!.id, { description: tx!.description, notes: null, categoryId: null, businessId: youtube, incomeSourceId: null })).toEqual({ ok: true })
    expect((await admin.from('transactions').select('nature').eq('id', tx!.id).single()).data!.nature).toBe('business')

    const after = splitTotals(await personalBusinessSplit(a.client, SEPTEMBER))
    expect(after.business.expenses).toBe(before.business.expenses + 3500)
    expect(after.personal.expenses).toBe(before.personal.expenses - 3500)
    expect(after.total).toEqual(before.total)

    // E tornando personale la natura si riallinea da sola.
    await updateTransactionDetails(a.client, tx!.id, { description: tx!.description, notes: null, categoryId: null, businessId: null, incomeSourceId: null })
    expect((await admin.from('transactions').select('nature').eq('id', tx!.id).single()).data!.nature).toBe('personal')
  })

  it('un altro utente non vede i dati', async () => {
    expect(await personalBusinessSplit(b.client, SEPTEMBER)).toEqual([])
    expect(await businessMonthly(b.client, voxel, SEPTEMBER)).toEqual([])
  })
})
