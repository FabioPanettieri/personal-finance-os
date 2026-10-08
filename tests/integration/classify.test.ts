import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { classifyTransaction } from '@/server/repositories/transactions'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** "Sistema" a due tocchi sullo stack locale: RLS, AAL2 e regola ricordata. Dati sintetici. */
let a: TestUser
let b: TestUser

async function insertTx(user: TestUser, amount: number, description: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data: account } = await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', 'ING Direct').single()
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: account!.id,
      booked_on: '2026-09-15',
      description,
      original_description: description.toUpperCase(),
      amount_cents: amount,
      type: amount > 0 ? 'income' : 'expense',
      nature: 'personal',
      source: 'manual',
      is_categorized: false,
      fingerprint: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('classify-a'), createTestUser('classify-b')])
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('classifyTransaction', () => {
  it('una spesa diventa spesa VOXEL Studio e la regola viene ricordata', async () => {
    const id = await insertTx(a, -2590, 'Filamento PLA Shop')
    expect(await classifyTransaction(a.client, id, 'voxel-expense', true)).toEqual({ ok: true, ruleCreated: true, linked: false })

    const { data: tx } = await admin
      .from('transactions')
      .select('type, nature, is_categorized, categorization_method, businesses(slug), transaction_categories(name)')
      .eq('id', id)
      .single()
    expect(tx).toMatchObject({ type: 'expense', nature: 'business', is_categorized: true, categorization_method: 'manual' })
    expect(tx!.businesses).toMatchObject({ slug: 'voxel-studio' })
    expect(tx!.transaction_categories).toMatchObject({ name: 'VOXEL Studio' })

    const { data: rules } = await admin.from('categorization_rules').select('name, origin, pattern, direction, set_type, user_id').eq('user_id', a.id).eq('origin', 'learned')
    expect(rules).toHaveLength(1)
    expect(rules![0]).toMatchObject({ name: 'Ricordato: Filamento PLA Shop', direction: 'out', set_type: 'expense' })

    // Seconda volta sullo stesso testo: aggiorna la regola, non la duplica.
    const again = await insertTx(a, -1200, 'Filamento PLA Shop')
    await classifyTransaction(a.client, again, 'cat:Shopping', true)
    const { data: after } = await admin.from('categorization_rules').select('id').eq('user_id', a.id).eq('origin', 'learned')
    expect(after).toHaveLength(1)
  })

  it('entrata personale con fonte; "Dai miei conti" non è un’entrata', async () => {
    const salary = await insertTx(a, 180000, 'Stipendio settembre')
    expect(await classifyTransaction(a.client, salary, 'salary', false)).toEqual({ ok: true, ruleCreated: false, linked: false })
    const { data: s } = await admin.from('transactions').select('type, income_sources(name)').eq('id', salary).single()
    expect(s).toMatchObject({ type: 'income', income_sources: { name: 'Stipendio' } })

    const move = await insertTx(a, 50000, 'Bonifico da me')
    await classifyTransaction(a.client, move, 'transfer-in', false)
    const { data: m } = await admin.from('transactions').select('type, nature, income_source_id, business_id').eq('id', move).single()
    expect(m).toEqual({ type: 'transfer', nature: 'transfer', income_source_id: null, business_id: null })
  })

  it('rifiuta scelte incoerenti con il segno', async () => {
    const id = await insertTx(a, -500, 'Caffè')
    expect(await classifyTransaction(a.client, id, 'salary', false)).toEqual({ ok: false, error: 'Scelta non valida per questo movimento' })
  })

  it('un altro utente non vede né modifica il movimento', async () => {
    const id = await insertTx(a, -700, 'Privato di A')
    expect(await classifyTransaction(b.client, id, 'cat:Casa', true)).toEqual({ ok: false, error: 'Movimento non trovato' })
    const { data } = await admin.from('transactions').select('is_categorized').eq('id', id).single()
    expect(data!.is_categorized).toBe(false)
    const { count } = await admin.from('categorization_rules').select('id', { count: 'exact', head: true }).eq('user_id', b.id).eq('origin', 'learned')
    expect(count).toBe(0)
  })
})
