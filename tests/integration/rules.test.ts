import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyRulesToPending, createLearnedRule, createRule, listRules, previewRuleMatches, ruleSuggestions, setRuleActive } from '@/server/repositories/rules'

import { admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/** Sprint 11 — classificazione intelligente sullo stack locale (RLS + AAL2), dati sintetici. */
let a: TestUser
let b: TestUser
let revolut: string
let spesa: string
let seq = 0

async function tx(user: TestUser, description: string, amount: number, manual: { categoryId: string } | null) {
  seq += 1
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: revolut,
      booked_on: `2026-09-${String((seq % 28) + 1).padStart(2, '0')}`,
      description,
      original_description: description.toUpperCase(),
      amount_cents: amount,
      type: amount > 0 ? 'income' : 'expense',
      nature: 'personal',
      category_id: manual?.categoryId ?? null,
      source: 'manual',
      is_categorized: manual !== null,
      categorization_method: manual ? 'manual' : 'none',
      fingerprint: (1000 + seq).toString(16).padStart(64, '0'),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

const row = async (id: string) =>
  (await admin.from('transactions').select('is_categorized, categorization_method, categorization_confidence, categorization_rule_id, category_id').eq('id', id).single()).data!

beforeAll(async () => {
  ;[a, b] = await Promise.all([createTestUser('rules-a'), createTestUser('rules-b')])
  revolut = (await admin.from('accounts').select('id').eq('user_id', a.id).eq('name', 'Revolut').single()).data!.id
  spesa = (await admin.from('transaction_categories').select('id').eq('user_id', a.id).eq('name', 'Spesa').single()).data!.id
  for (const n of ['1234', '5678', '9012']) await tx(a, `PANIFICIO ROSSI ${n} TORINO`, -2500, { categoryId: spesa })
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b)])
})

describe('regole imparate', () => {
  it('tre correzioni uguali → regola suggerita al 90%; accettata, si applica da sola', async () => {
    const suggestion = (await ruleSuggestions(a.client)).find((s) => s.pattern === 'panificio rossi')!
    expect(suggestion).toMatchObject({ direction: 'out', categoryId: spesa, count: 3, confidence: 0.9 })
    expect(await createLearnedRule(a.client, suggestion, 'Spesa')).toMatchObject({ ok: true })
    expect((await ruleSuggestions(a.client)).find((s) => s.pattern === 'panificio rossi')).toBeUndefined()

    const pending = await tx(a, 'PANIFICIO ROSSI 3456 TORINO', -1800, null)
    const report = await applyRulesToPending(a.client)
    expect(report.applied).toBeGreaterThanOrEqual(1)
    expect(await row(pending)).toMatchObject({ is_categorized: true, categorization_method: 'rule', category_id: spesa })
    const rule = (await listRules(a.client)).find((r) => r.origin === 'learned')!
    expect(rule.hitCount).toBe(1)
  })
})

describe('nessuna applicazione automatica sotto soglia', () => {
  it('una regola "proponi soltanto" lascia il movimento da confermare', async () => {
    expect(await createRule(a.client, { pattern: 'zorblax lupo', matchField: 'description', matchType: 'contains', direction: 'out', amountMinCents: null, amountMaxCents: 2000, choiceKey: 'cat:Alimentazione', autoApply: false })).toMatchObject({ ok: true })
    const small = await tx(a, 'Zorblax Lupo Termini', -350, null)
    const big = await tx(a, 'Zorblax Lupo Termini', -9000, null)
    const report = await applyRulesToPending(a.client)
    expect(report.proposed).toBe(1)
    expect(await row(small)).toMatchObject({ is_categorized: false, categorization_method: 'rule', categorization_confidence: 0.7 })
    expect((await row(small)).category_id).not.toBeNull()
    // Oltre l'importo massimo la regola non si applica.
    expect(await row(big)).toMatchObject({ is_categorized: false, categorization_method: 'none', category_id: null })
  })

  it('una regola disattivata non si applica', async () => {
    const rule = (await listRules(a.client)).find((r) => r.pattern === 'zorblax lupo')!
    expect(await setRuleActive(a.client, rule.id, false)).toBe(true)
    const other = await tx(a, 'Zorblax Lupo Centrale', -400, null)
    await applyRulesToPending(a.client)
    expect(await row(other)).toMatchObject({ categorization_method: 'none' })
  })

  it('anteprima: movimenti che corrisponderebbero', async () => {
    const n = await previewRuleMatches(a.client, {
      id: 'p',
      dbId: null,
      name: 'p',
      priority: 0,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'panificio rossi',
      accountId: null,
      direction: 'out',
      amountMinCents: null,
      amountMaxCents: null,
      setType: 'expense',
      setNature: null,
      confidence: 1,
    })
    expect(n).toBe(4)
  })
})

describe('isolamento', () => {
  it('un altro utente non vede le regole di A e non ne tocca i movimenti', async () => {
    const rulesB = await listRules(b.client)
    expect(rulesB.find((r) => r.origin === 'learned' || r.pattern === 'zorblax lupo')).toBeUndefined()
    expect(await ruleSuggestions(b.client)).toEqual([])
    expect(await applyRulesToPending(b.client)).toEqual({ applied: 0, proposed: 0, untouched: 0, linked: 0 })
  })
})
