import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { addToGoal, createGoal, deleteGoal, setGoalArchived, updateGoal } from '@/server/repositories/goals'
import { loadGoals } from '@/server/services/goals'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 10 — obiettivi sullo stack locale (RLS + AAL2), dati sintetici. */
const TODAY = toIsoDate('2026-10-09')

let a: TestUser
let b: TestUser
let savings: string
let revolut: string

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('goals-a'), createTestUser('goals-b')])
  const accounts = (await admin.from('accounts').select('id, name').eq('user_id', a.id)).data!
  savings = accounts.find((x) => x.name === 'ING Conto Risparmio')!.id
  revolut = accounts.find((x) => x.name === 'Revolut')!.id
  const { error } = await admin.from('transactions').insert({
    user_id: a.id,
    account_id: savings,
    booked_on: '2026-09-01',
    description: 'Accantonamento',
    original_description: 'ACCANTONAMENTO',
    amount_cents: 300000,
    type: 'income',
    nature: 'personal',
    source: 'manual',
    is_categorized: true,
    categorization_method: 'manual',
    fingerprint: 'd1'.padStart(64, '0'),
  })
  if (error) throw error
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('obiettivi', () => {
  it('manuale con scadenza: aggiungi, togli, quanto serve al mese', async () => {
    const created = await createGoal(a.client, { name: 'Vacanza', targetCents: 120000, deadline: toIsoDate('2026-12-31'), tracking: 'manual', manualCents: 20000, links: [] })
    expect(created.ok).toBe(true)
    const id = created.ok ? created.id : ''
    expect(await addToGoal(a.client, id, 10000)).toEqual({ ok: true, id })
    expect(await addToGoal(a.client, id, -50000)).toEqual({ ok: false, error: 'Non puoi togliere più di quanto hai messo' })
    const goal = (await loadGoals(a.client, TODAY)).find((g) => g.id === id)!
    expect(goal.progress).toMatchObject({ current: 30000, remaining: 90000, monthsLeft: 3, monthlyNeeded: 30000, status: 'active' })
  })

  it('dai saldi dei conti: quota del conto deposito, aggiornata con i movimenti', async () => {
    const created = await createGoal(a.client, { name: 'Fondo emergenze', targetCents: 500000, deadline: null, tracking: 'linked_accounts', manualCents: 0, links: [{ accountId: savings, shareBps: 5000 }] })
    expect(created.ok).toBe(true)
    const id = created.ok ? created.id : ''
    let goal = (await loadGoals(a.client, TODAY)).find((g) => g.id === id)!
    expect(goal.progress.current).toBe(150000)
    expect(goal.accountNames).toEqual(['ING Conto Risparmio'])

    expect(await updateGoal(a.client, id, { name: 'Fondo emergenze', targetCents: 300000, deadline: null, tracking: 'linked_accounts', manualCents: 0, links: [{ accountId: savings, shareBps: 10000 }, { accountId: revolut, shareBps: 10000 }] })).toEqual({ ok: true, id })
    goal = (await loadGoals(a.client, TODAY)).find((g) => g.id === id)!
    expect(goal.progress).toMatchObject({ current: 300000, status: 'achieved', ratio: 1 })
    expect(await addToGoal(a.client, id, 100)).toEqual({ ok: false, error: 'Questo obiettivo segue i saldi dei conti' })
  })

  it('validazione', async () => {
    expect(await createGoal(a.client, { name: ' ', targetCents: 100, deadline: null, tracking: 'manual', manualCents: 0, links: [] })).toMatchObject({ ok: false })
    expect(await createGoal(a.client, { name: 'x', targetCents: 0, deadline: null, tracking: 'manual', manualCents: 0, links: [] })).toMatchObject({ ok: false })
    expect(await createGoal(a.client, { name: 'x', targetCents: 100, deadline: null, tracking: 'linked_accounts', manualCents: 0, links: [] })).toEqual({ ok: false, error: 'Scegli almeno un conto' })
  })

  it('archivia ed elimina', async () => {
    const created = await createGoal(a.client, { name: 'Temporaneo', targetCents: 100, deadline: null, tracking: 'manual', manualCents: 0, links: [] })
    const id = created.ok ? created.id : ''
    expect(await setGoalArchived(a.client, id, true)).toBe(true)
    expect((await loadGoals(a.client, TODAY)).map((g) => g.name)).not.toContain('Temporaneo')
    expect((await loadGoals(a.client, TODAY, { archived: true })).map((g) => g.name)).toContain('Temporaneo')
    expect(await deleteGoal(a.client, id)).toBe(true)
  })

  it('isolamento: un altro utente non vede, non modifica e non collega i conti di A', async () => {
    const [goal] = await loadGoals(a.client, TODAY)
    expect(await loadGoals(b.client, TODAY)).toEqual([])
    expect(await addToGoal(b.client, goal!.id, 100)).toEqual({ ok: false, error: 'Obiettivo non trovato' })
    expect(await deleteGoal(b.client, goal!.id)).toBe(false)
    const stolen = await createGoal(b.client, { name: 'Furbo', targetCents: 100, deadline: null, tracking: 'linked_accounts', manualCents: 0, links: [{ accountId: savings, shareBps: 10000 }] })
    expect(stolen).toMatchObject({ ok: false })
    expect(await loadGoals(b.client, TODAY)).toEqual([])
  })
})
