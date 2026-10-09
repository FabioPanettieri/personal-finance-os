import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAccounts } from '@/server/repositories/accounts'
import { applyRulesToPending } from '@/server/repositories/rules'

import { admin, createTestUser, deleteTestUser, fingerprint, type TestUser } from './helpers'

/**
 * Giroconti riconosciuti da soli (nome dell'intestatario, IBAN ricorrenti) e
 * spese della carta di credito senza estratto dettagliato (migration 0012).
 * Dati sintetici: nomi e IBAN inventati.
 */
const OTHER_IBAN = 'IT60X0542811101000000123456'
let a: TestUser
let b: TestUser

async function accountId(user: TestUser, name: string): Promise<string> {
  const { data } = await admin.from('accounts').select('id').eq('user_id', user.id).eq('name', name).single()
  return data!.id
}

type Row = { account: string; day: string; amount: number; type: 'income' | 'expense' | 'transfer'; description: string; original?: string; counterparty?: string | null; categorized?: boolean; manual?: boolean }

async function insert(user: TestUser, key: string, r: Row): Promise<string> {
  const categorized = r.categorized ?? false
  const { data, error } = await admin
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: await accountId(user, r.account),
      booked_on: r.day,
      description: r.description,
      original_description: r.original ?? r.description,
      amount_cents: r.amount,
      type: r.type,
      nature: r.type === 'transfer' ? 'transfer' : 'personal',
      counterparty: r.counterparty ?? null,
      source: 'csv_import',
      is_categorized: categorized,
      categorization_method: r.manual ? 'manual' : 'rule',
      categorization_confidence: categorized ? 1 : 0.4,
      fingerprint: fingerprint(`${user.id}-${key}`),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

const tx = async (id: string) => (await admin.from('transactions').select('type, is_categorized, transfer_group_id, category_id').eq('id', id).single()).data!

describe('giroconti riconosciuti da soli', () => {
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    ;[a, b] = await Promise.all([createTestUser('own-transfers-a'), createTestUser('own-transfers-b')])
    // La banca dichiara un giroconto: la controparte è l'intestatario.
    ids.giro = await insert(a, 'giro', { account: 'ING Direct', day: '2026-09-02', amount: 100000, type: 'transfer', description: 'Giroconto N. 1', counterparty: 'Mario Rossi', categorized: true })
    // Bonifico istantaneo a tuo nome (ING) e la ricarica corrispondente su Revolut, entrambi da sistemare.
    ids.out = await insert(a, 'out', { account: 'ING Direct', day: '2026-09-10', amount: -5000, type: 'expense', description: 'Bonifico istantaneo da voi disposto', counterparty: 'Mario Rossi' })
    ids.in = await insert(a, 'in', { account: 'Revolut', day: '2026-09-10', amount: 5000, type: 'income', description: 'Pagamento da MARIO ROSSI', counterparty: 'ROSSI MARIO' })
    ids.paypal = await insert(a, 'paypal', { account: 'Revolut', day: '2026-09-12', amount: 1450, type: 'income', description: 'Paypal*rossi Mario', counterparty: 'Paypal*rossi Mario' })
    // Un estraneo con un nome simile: non è un giroconto.
    ids.stranger = await insert(a, 'stranger', { account: 'Revolut', day: '2026-09-12', amount: 1900, type: 'income', description: 'Pagamento da MARIO BIANCHI', counterparty: 'MARIO BIANCHI' })
    // Tre bonifici allo stesso IBAN (altra banca, altro nome): conto proprio.
    for (const n of [1, 2, 3]) {
      ids[`iban${n}`] = await insert(a, `iban${n}`, {
        account: 'ING Direct',
        day: `2026-09-1${n}`,
        amount: -2000 * n,
        type: 'expense',
        description: 'Bonifico istantaneo da voi disposto',
        original: `Bonifico istantaneo da voi disposto N. X${n} A favore di Conto Deposito IBAN beneficiario ${OTHER_IBAN} BIC XXXXITMM`,
        counterparty: 'Conto Deposito',
      })
    }
    // Solo due bonifici all'affitto, uno corretto a mano come spesa: mai un giroconto.
    for (const n of [1, 2, 3]) {
      ids[`rent${n}`] = await insert(a, `rent${n}`, {
        account: 'ING Direct',
        day: `2026-0${n + 6}-01`,
        amount: -70000,
        type: 'expense',
        description: 'Bonifico istantaneo da voi disposto',
        original: `Bonifico istantaneo da voi disposto A favore di Proprietario Casa IBAN beneficiario IT02A0300203280000000000777 BIC XXXX`,
        counterparty: 'Proprietario Casa',
        categorized: n === 1,
        manual: n === 1,
      })
    }
  })

  afterAll(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)])
  })

  it('crea le regole e classifica come giroconto, collegando le due metà', async () => {
    const report = await applyRulesToPending(a.client)
    expect(report.linked).toBeGreaterThanOrEqual(1)

    const rules = (await a.client.from('categorization_rules').select('name, pattern, confidence').like('name', 'Giroconto: %')).data!
    expect(rules.map((r) => r.name).sort()).toEqual(['Giroconto: bonifici a tuo nome', 'Giroconto: bonifici ripetuti verso IBAN …3456'])

    for (const key of ['out', 'in', 'paypal', 'iban1', 'iban2', 'iban3']) {
      expect(await tx(ids[key]!), key).toMatchObject({ type: 'transfer', is_categorized: true })
    }
    const out = await tx(ids.out!)
    expect(out.transfer_group_id).not.toBeNull()
    expect((await tx(ids.in!)).transfer_group_id).toBe(out.transfer_group_id)

    expect((await tx(ids.stranger!)).type).toBe('income')
    expect((await tx(ids.rent2!)).type).toBe('expense')
  })

  it('riapplicare non duplica le regole', async () => {
    await applyRulesToPending(a.client)
    const rules = (await a.client.from('categorization_rules').select('id').like('name', 'Giroconto: %')).data!
    expect(rules).toHaveLength(2)
  })

  it('le regole di un utente non toccano l’altro (RLS)', async () => {
    const rules = (await b.client.from('categorization_rules').select('id').like('name', 'Giroconto: %')).data!
    expect(rules).toHaveLength(0)
  })
})

describe('carta di credito senza dettaglio', () => {
  let c: TestUser
  beforeAll(async () => {
    c = await createTestUser('card-spending')
  })
  afterAll(async () => {
    await deleteTestUser(c)
  })

  it('ogni addebito diventa una spesa "Carta di credito": saldo carta a zero, patrimonio corretto', async () => {
    const card = await accountId(c, 'Carta di credito')
    const { data: group } = await admin.from('transfer_groups').insert({ user_id: c.id, kind: 'internal', detected_by: 'auto', confidence: 0.95 }).select('id').single()
    const ing = await insert(c, 'bill', { account: 'ING Direct', day: '2026-09-10', amount: -82983, type: 'transfer', description: 'Estratto conto carta di credito', categorized: true })
    await admin.from('transactions').update({ transfer_group_id: group!.id }).eq('id', ing)
    const { data: mirror, error } = await admin
      .from('transactions')
      .insert({
        user_id: c.id,
        account_id: card,
        booked_on: '2026-09-10',
        description: 'Da ING Direct · Estratto conto carta di credito',
        original_description: 'Estratto conto carta di credito',
        amount_cents: 82983,
        type: 'transfer',
        nature: 'transfer',
        transfer_group_id: group!.id,
        source: 'csv_import',
        is_categorized: true,
        categorization_method: 'rule',
        categorization_confidence: 0.95,
        fingerprint: fingerprint(`${c.id}-mirror`),
      })
      .select('id')
      .single()
    if (error) throw error

    const spend = (await c.client.from('transactions').select('amount_cents, type, transaction_categories(name)').eq('account_id', card).eq('type', 'expense')).data!
    expect(spend).toHaveLength(1)
    expect(spend[0]).toMatchObject({ amount_cents: -82983, type: 'expense', transaction_categories: { name: 'Carta di credito' } })

    const accounts = await listAccounts(c.client)
    expect(accounts.find((x) => x.name === 'Carta di credito')!.balance).toBe(0)

    // Plafond: solo informativo, maggiore di zero.
    expect((await c.client.from('accounts').update({ credit_limit_cents: 200000 }).eq('id', card).select('credit_limit_cents')).data).toEqual([{ credit_limit_cents: 200000 }])
    expect((await c.client.from('accounts').update({ credit_limit_cents: 0 }).eq('id', card)).error).not.toBeNull()

    // Se sparisce l'addebito, sparisce anche la spesa.
    await admin.from('transactions').delete().eq('id', mirror.id)
    expect((await c.client.from('transactions').select('id').eq('account_id', card)).data).toHaveLength(0)
  })
})
