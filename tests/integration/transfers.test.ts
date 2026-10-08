import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { listAccounts } from '@/server/repositories/accounts'
import { classifyTransaction } from '@/server/repositories/transactions'
import { linkTransfer, transferCandidates, unlinkTransfer, unmatchedTransferCount } from '@/server/repositories/transfers'
import { loadDashboard } from '@/server/services/dashboard'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Sprint 5 — trasferimenti ING ↔ Revolut ↔ Trade Republic sullo stack locale
 * (RLS + AAL2). Dati sintetici. Il patrimonio non cambia mai collegando o
 * scollegando: cambia solo cosa conta come entrata/uscita.
 */
const SEPTEMBER = { period: 'custom', from: '2026-09-01', to: '2026-09-30' }
const TODAY = toIsoDate('2026-10-05')

let a: TestUser
let b: TestUser
const ids: Record<string, string> = {}

async function accountId(user: TestUser, name: string): Promise<string> {
  const { data } = await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', name).single()
  return data!.id
}

async function insert(user: TestUser, key: string, account: string, day: string, amount: number, type: 'income' | 'expense' | 'transfer', description: string) {
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: await accountId(user, account),
      booked_on: day,
      description,
      original_description: description.toUpperCase(),
      amount_cents: amount,
      type,
      nature: type === 'transfer' ? 'transfer' : 'personal',
      source: 'manual',
      is_categorized: type !== 'transfer',
      categorization_method: type !== 'transfer' ? 'manual' : 'none',
      fingerprint: key.padEnd(64, '0'),
    })
    .select('id')
    .single()
  if (error) throw error
  ids[key] = data.id
}

const netWorth = async (user: TestUser) => (await listAccounts(user.client)).reduce((s, x) => s + x.balance, 0)
const typeOf = async (id: string) => (await admin.from('transactions').select('type, transfer_group_id').eq('id', id).single()).data!

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('transfers-a'), createTestUser('transfers-b')])
  await insert(a, 'a1', 'ING Direct', '2026-09-01', 300000, 'income', 'Stipendio')
  // ING → Revolut: la ricarica su Revolut è stata letta come entrata.
  await insert(a, 'a2', 'ING Direct', '2026-09-05', -50000, 'transfer', 'Bonifico a Revolut')
  await insert(a, 'a3', 'Revolut', '2026-09-06', 50000, 'income', 'Ricarica da ING')
  // Revolut → Trade Republic: la metà su TR è già un trasferimento.
  await insert(a, 'a4', 'Revolut', '2026-09-10', -20000, 'expense', 'Trade Republic')
  await insert(a, 'a5', 'Trade Republic', '2026-09-11', 20000, 'transfer', 'Versamento')
  await insert(a, 'a6', 'Revolut', '2026-09-12', -3000, 'expense', 'Supermercato')
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('ING ↔ Revolut ↔ Trade Republic', () => {
  it('prima dell’abbinamento: patrimonio corretto, entrate gonfiate, trasferimenti da abbinare', async () => {
    expect(await netWorth(a)).toBe(297000)
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.flows.income).toBe(350000)
    expect(await unmatchedTransferCount(a.client)).toBe(2)
  })

  it('collegamento manuale ING → Revolut: la ricarica non è più un’entrata', async () => {
    const candidates = await transferCandidates(a.client, ids.a2!)
    expect(candidates.map((c) => c.id)).toEqual([ids.a3])
    expect(candidates[0]).toMatchObject({ accountName: 'Revolut', amount: 50000 })

    expect(await linkTransfer(a.client, ids.a2!, ids.a3!)).toEqual({ ok: true })
    const [x, y] = [await typeOf(ids.a2!), await typeOf(ids.a3!)]
    expect(x.type).toBe('transfer')
    expect(y.type).toBe('transfer')
    expect(x.transfer_group_id).not.toBeNull()
    expect(x.transfer_group_id).toBe(y.transfer_group_id)

    expect(await netWorth(a)).toBe(297000)
    expect((await loadDashboard(a.client, SEPTEMBER, TODAY)).flows.income).toBe(300000)
  })

  it('"Verso i miei conti" su Revolut → TR collega da solo l’unica altra metà, come versamento', async () => {
    const result = await classifyTransaction(a.client, ids.a4!, 'transfer-out', false)
    expect(result).toEqual({ ok: true, ruleCreated: false, linked: true })
    const [x, y] = [await typeOf(ids.a4!), await typeOf(ids.a5!)]
    expect(x.type).toBe('investment')
    expect(y.type).toBe('investment')
    expect(x.transfer_group_id).toBe(y.transfer_group_id)

    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.flows).toMatchObject({ income: 300000, expenses: 3000 })
    expect(await netWorth(a)).toBe(297000)
    expect(await unmatchedTransferCount(a.client)).toBe(0)
  })

  it('scollegare lascia due trasferimenti da abbinare, il patrimonio non cambia', async () => {
    const group = (await typeOf(ids.a2!)).transfer_group_id!
    expect(await unlinkTransfer(a.client, group)).toEqual({ ok: true })
    expect((await typeOf(ids.a2!)).transfer_group_id).toBeNull()
    expect(await unmatchedTransferCount(a.client)).toBe(2)
    expect(await netWorth(a)).toBe(297000)
    const { count } = await admin.from('transfer_groups').select('id', { count: 'exact', head: true }).eq('id', group)
    expect(count).toBe(0)
  })

  it('riclassificare una metà come spesa scioglie il trasferimento', async () => {
    expect(await linkTransfer(a.client, ids.a2!, ids.a3!)).toEqual({ ok: true })
    expect(await classifyTransaction(a.client, ids.a3!, 'other-income', false)).toMatchObject({ ok: true })
    expect(await typeOf(ids.a3!)).toEqual({ type: 'income', transfer_group_id: null })
    expect(await typeOf(ids.a2!)).toEqual({ type: 'transfer', transfer_group_id: null })
    expect(await netWorth(a)).toBe(297000)
  })

  it('collegamenti impossibili rifiutati con un messaggio chiaro', async () => {
    expect(await linkTransfer(a.client, ids.a2!, ids.a6!)).toEqual({ ok: false, error: 'Gli importi devono essere opposti e nella stessa valuta' })
    expect(await linkTransfer(a.client, ids.a4!, ids.a5!)).toEqual({ ok: false, error: 'Uno dei due movimenti è già collegato' })
    expect(await linkTransfer(a.client, ids.a3!, ids.a6!)).toEqual({ ok: false, error: 'Le due metà devono essere su conti diversi' })
  })
})

describe('isolamento', () => {
  it('un altro utente non vede candidati e non collega né scollega', async () => {
    expect(await transferCandidates(b.client, ids.a2!)).toEqual([])
    expect(await linkTransfer(b.client, ids.a2!, ids.a3!)).toEqual({ ok: false, error: 'Movimento non trovato' })
    const group = (await typeOf(ids.a4!)).transfer_group_id!
    expect(await unlinkTransfer(b.client, group)).toEqual({ ok: false, error: 'Trasferimento non trovato' })
    expect((await typeOf(ids.a4!)).transfer_group_id).toBe(group)
    expect(await unmatchedTransferCount(b.client)).toBe(0)
  })
})
