import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseTransactionFilters } from '@/lib/transactions/filters'
import {
  bulkClassify,
  bulkConfirm,
  listTransactions,
  matchingTransactionIds,
  updateTransactionDetails,
} from '@/server/repositories/transactions'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 6 — explorer: modifica di gruppo su 500 movimenti, ordinamento, modifica del singolo. Dati sintetici. */
let a: TestUser
let b: TestUser
let incomeId: string

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('bulk-a'), createTestUser('bulk-b')])
  const { data: account } = await admin.from('accounts').select('id').eq('user_id', a.id).eq('name', 'Revolut').single()
  const rows = Array.from({ length: 500 }, (_, i) => ({
    user_id: a.id,
    account_id: account!.id,
    booked_on: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    description: `Acquisto online ${i}`,
    original_description: `ACQUISTO ${i}`,
    amount_cents: -(100 + i),
    type: 'expense' as const,
    nature: 'personal' as const,
    source: 'manual' as const,
    is_categorized: false,
    categorization_method: 'rule' as const,
    fingerprint: i.toString(16).padStart(64, '0'),
  }))
  const { error } = await admin.from('transactions').insert(rows)
  if (error) throw error
  const { data: income, error: e } = await admin
    .from('transactions')
    .insert({
      user_id: a.id,
      account_id: account!.id,
      booked_on: '2026-08-15',
      description: 'Rimborso amico',
      original_description: 'RIMBORSO',
      amount_cents: 99999,
      type: 'income',
      nature: 'personal',
      source: 'manual',
      is_categorized: false,
      categorization_method: 'rule',
      fingerprint: 'f'.repeat(64),
    })
    .select('id')
    .single()
  if (e) throw e
  incomeId = income.id
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('modifica di gruppo', () => {
  it('"tutti i risultati" di una ricerca: 500 movimenti classificati in un colpo', async () => {
    const filters = parseTransactionFilters({ q: 'Acquisto online' })
    const { ids, total } = await matchingTransactionIds(a.client, filters, null)
    expect(total).toBe(500)
    expect(ids).toHaveLength(500)

    const started = Date.now()
    expect(await bulkClassify(a.client, ids, 'cat:Shopping', 'out')).toEqual({ ok: true, updated: 500, skipped: 0 })
    expect(Date.now() - started).toBeLessThan(5000)

    const { data } = await admin.from('transactions').select('is_categorized, transaction_categories(name)').eq('user_id', a.id).lt('amount_cents', 0)
    expect(data).toHaveLength(500)
    expect(data!.every((t) => t.is_categorized && (t.transaction_categories as { name: string } | null)?.name === 'Shopping')).toBe(true)
  })

  it('una scelta da uscita non tocca le entrate selezionate insieme', async () => {
    const { ids } = await matchingTransactionIds(a.client, parseTransactionFilters({ from: '2026-08-15', to: '2026-08-15' }), null)
    expect(ids).toContain(incomeId)
    const result = await bulkClassify(a.client, ids, 'cat:Casa', 'out')
    expect(result).toMatchObject({ ok: true, skipped: 1 })
    expect((await admin.from('transactions').select('type').eq('id', incomeId).single()).data!.type).toBe('income')
  })

  it('conferma di gruppo e limite di 1000', async () => {
    expect(await bulkConfirm(a.client, [incomeId])).toEqual({ ok: true, updated: 1, skipped: 0 })
    expect(await bulkConfirm(a.client, [incomeId])).toEqual({ ok: true, updated: 0, skipped: 1 })
    const tooMany = Array.from({ length: 1001 }, () => incomeId)
    expect(await bulkConfirm(a.client, tooMany)).toEqual({ ok: false, error: 'Al massimo 1000 movimenti alla volta' })
  })

  it('un altro utente non modifica nulla', async () => {
    const { ids } = await matchingTransactionIds(b.client, parseTransactionFilters({}), null)
    expect(ids).toEqual([])
    expect(await bulkClassify(b.client, [incomeId], 'salary', 'in')).toEqual({ ok: true, updated: 0, skipped: 1 })
  })
})

describe('ordinamento', () => {
  it('spese più grandi e entrate più grandi', async () => {
    const asc = await listTransactions(a.client, parseTransactionFilters({ sort: 'amount-asc' }), null)
    expect(asc.items[0]!.amount).toBe(-599)
    const desc = await listTransactions(a.client, parseTransactionFilters({ sort: 'amount-desc' }), null)
    expect(desc.items[0]!.id).toBe(incomeId)
  })
})

describe('modifica del singolo movimento', () => {
  it('descrizione, note e categoria; categoria di un altro tipo rifiutata', async () => {
    const { data: casa } = await admin.from('transaction_categories').select('id').eq('user_id', a.id).eq('name', 'Casa').single()
    const { data: stipendio } = await admin.from('transaction_categories').select('id').eq('user_id', a.id).eq('name', 'Stipendio').single()
    const { data: source } = await admin.from('income_sources').select('id').eq('user_id', a.id).eq('name', 'Stipendio').single()

    expect(await updateTransactionDetails(a.client, incomeId, { description: ' Rimborso cena ', notes: 'Pizza con Luca', categoryId: casa!.id, businessId: null, incomeSourceId: null })).toEqual({
      ok: false,
      error: 'Categoria non adatta a questo movimento',
      field: 'categoryId',
    })
    expect(await updateTransactionDetails(a.client, incomeId, { description: ' Rimborso cena ', notes: 'Pizza con Luca', categoryId: stipendio!.id, businessId: null, incomeSourceId: source!.id })).toEqual({ ok: true })
    const { data } = await admin.from('transactions').select('description, notes, category_id, income_source_id').eq('id', incomeId).single()
    expect(data).toEqual({ description: 'Rimborso cena', notes: 'Pizza con Luca', category_id: stipendio!.id, income_source_id: source!.id })

    expect(await updateTransactionDetails(a.client, incomeId, { description: '   ', notes: null, categoryId: null, businessId: null, incomeSourceId: null })).toMatchObject({ ok: false, field: 'description' })
    expect(await updateTransactionDetails(b.client, incomeId, { description: 'x', notes: null, categoryId: null, businessId: null, incomeSourceId: null })).toEqual({ ok: false, error: 'Movimento non trovato' })
  })
})
