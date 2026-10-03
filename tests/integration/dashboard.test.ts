import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { parseTransactionFilters } from '@/lib/transactions/filters'
import { listAccounts } from '@/server/repositories/accounts'
import { getTransaction, listTransactions } from '@/server/repositories/transactions'
import { loadDashboard } from '@/server/services/dashboard'

import { EXPECTED, seedDashboard } from '../support/dashboard-seed'
import { admin, anonClient, createTestUser, deleteTestUser, signIn, type TestUser } from './helpers'

/**
 * Dashboard sullo stack Supabase locale: aggregati SQL (SECURITY INVOKER) +
 * logica pura, con RLS e AAL2 attive. Dati sintetici (tests/support/dashboard-seed.ts).
 */
const TODAY = toIsoDate('2026-10-03')
const SEPTEMBER = { period: 'custom', from: '2026-09-01', to: '2026-09-30' }

let a: TestUser
let b: TestUser
let empty: TestUser

beforeAll(async () => {
  ;[a, b, empty] = await Promise.all([createTestUser('dash-a'), createTestUser('dash-b'), createTestUser('dash-empty')])
  await seedDashboard(admin, a.id)
  await seedDashboard(admin, b.id)
  // B ha un'entrata in più: i suoi totali sono diversi da quelli di A.
  const { data: bIng } = await admin.from('accounts').select('id').eq('user_id', b.id).eq('name', 'ING Direct').single()
  const { error } = await admin.from('transactions').insert({
    user_id: b.id,
    account_id: bIng!.id,
    booked_on: '2026-09-28',
    description: 'Entrata solo di B',
    original_description: 'ENTRATA SOLO DI B',
    amount_cents: 99900,
    type: 'income',
    nature: 'personal',
    source: 'manual',
    fingerprint: 'b'.repeat(64),
  })
  if (error) throw error
})

afterAll(async () => {
  await Promise.all([deleteTestUser(a), deleteTestUser(b), deleteTestUser(empty)])
})

describe('KPI', () => {
  it('patrimonio netto, liquidità, investimenti al costo e carta senza doppi conteggi', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.breakdown).toEqual({
      netWorth: EXPECTED.netWorth,
      liquidity: EXPECTED.liquidity,
      investedAtCost: EXPECTED.investedAtCost,
      cards: EXPECTED.cards,
      other: 0,
    })
    // Il patrimonio è esattamente la somma dei saldi di account_balances.
    const accounts = await listAccounts(a.client)
    expect(accounts.reduce((s, x) => s + x.balance, 0)).toBe(EXPECTED.netWorth)
    expect(Object.fromEntries(accounts.map((x) => [x.name, x.balance]))).toEqual(EXPECTED.balances)
  })

  it('entrate, uscite e cash flow del periodo escludono trasferimenti e investimenti', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.flows).toMatchObject(EXPECTED.september)
    // Settembre contiene ING → Revolut, ING → Risparmio, ING → Carta e Revolut → Trade Republic:
    // 1.000 € spostati tra conti propri, nessuno conta come entrata o uscita.
    expect(d.categories.map((c) => c.label)).not.toContain('Trasferimenti')
    expect(d.categories.map((c) => c.label)).not.toContain('Investimenti')
    expect(d.incomeSources.reduce((s, x) => s + x.amount, 0)).toBe(EXPECTED.september.income)
  })

  it('ING → Carta di credito non è una spesa finale', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    const casa = d.categories.find((c) => c.label === 'Casa')!
    expect(casa.amount).toBe(72000)
    expect(d.flows.expenses).toBe(EXPECTED.september.expenses) // senza i 400 € dell'addebito carta
    expect(d.accounts.find((x) => x.name === 'Carta di credito')).toMatchObject({ balance: 40000, periodChange: 40000 })
  })

  it('periodi: mese scorso con confronto, anno, tutto, personalizzato', async () => {
    const lastMonth = await loadDashboard(a.client, { period: 'last-month' }, TODAY)
    expect([lastMonth.period.from, lastMonth.period.to]).toEqual(['2026-09-01', '2026-09-30'])
    expect(lastMonth.flows).toMatchObject(EXPECTED.september)
    expect(lastMonth.previousFlows).toMatchObject(EXPECTED.august)
    expect(lastMonth.comparison.income).toBeCloseTo((201500 - 165000) / 165000, 10)

    const year = await loadDashboard(a.client, { period: 'ytd' }, TODAY)
    expect(year.flows).toMatchObject({ income: EXPECTED.all.income, expenses: EXPECTED.all.expenses })
    // Anno precedente senza dati: nessun confronto.
    expect(year.comparison.income).toBeNull()

    const all = await loadDashboard(a.client, { period: 'all' }, TODAY)
    expect(all.period.from).toBe(EXPECTED.firstDate)
    expect(all.flows).toMatchObject({ income: EXPECTED.all.income, expenses: EXPECTED.all.expenses })
    expect(all.bars.map((x) => x.month)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])

    const quarter = await loadDashboard(a.client, { period: '3m' }, TODAY)
    expect([quarter.period.from, quarter.period.to]).toEqual(['2026-08-01', '2026-10-03'])
    // Il trimestre precedente (maggio–luglio) non è coperto dai dati: nessuna percentuale.
    expect(quarter.comparison.expenses).toBeNull()
  })

  it('attività: ricavi, spese, utile e margine; margine N/D senza ricavi', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    const voxel = d.businesses.find((x) => x.name === 'VOXEL Studio')!
    expect(voxel).toMatchObject(EXPECTED.voxel)
    expect(voxel.margin).toBeCloseTo(10750 / 12000, 10)
    expect(d.businesses.find((x) => x.name === 'Il Progettista Meccanico')).toMatchObject({ ...EXPECTED.youtube, margin: 1 })
    expect(d.businesses.find((x) => x.name === 'Altro')).toMatchObject({ revenue: 0, expenses: 0, margin: null })
  })

  it('storico del patrimonio: dal primo dato, ultimo punto = patrimonio attuale', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.history[0]!.date).toBe(EXPECTED.firstDate)
    expect(d.history.at(-1)!.balance).toBe(EXPECTED.netWorth)
  })

  it('da verificare, attività recenti, ultimo import', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    expect(d.review).toEqual({ transactions: EXPECTED.uncategorized, importRows: 0 })
    expect(d.recent).toHaveLength(10)
    expect(d.recent[0]).toMatchObject({ description: 'Supermercato', bookedOn: '2026-10-02', isCategorized: false })
    expect(d.imports).toEqual([])
  })
})

describe('lista e dettaglio coerenti con gli aggregati', () => {
  it('il link di una categoria elenca esattamente i movimenti conteggiati', async () => {
    const d = await loadDashboard(a.client, SEPTEMBER, TODAY)
    const casa = d.categories.find((c) => c.label === 'Casa')!
    const page = await listTransactions(
      a.client,
      parseTransactionFilters({ from: '2026-09-01', to: '2026-09-30', type: 'spending', category: casa.categoryId! }),
      casa.categoryIds,
    )
    expect(page.total).toBe(casa.count)
    expect(-page.items.reduce((s, t) => s + t.amount, 0)).toBe(casa.amount)
  })

  it('"Da verificare" e trasferimento collegato nel dettaglio', async () => {
    const review = await listTransactions(a.client, parseTransactionFilters({ status: 'review' }), null)
    expect(review.items.map((t) => t.description)).toEqual(['Supermercato'])

    const transfers = await listTransactions(a.client, parseTransactionFilters({ type: 'transfer', q: 'Addebito carta' }), null)
    const ingLeg = transfers.items.find((t) => t.accountName === 'ING Direct')!
    const detail = (await getTransaction(a.client, ingLeg.id))!
    expect(detail.transferLegs).toMatchObject([{ accountName: 'Carta di credito', amount: 40000 }])
  })

  it('la ricerca tratta % e _ come testo', async () => {
    const page = await listTransactions(a.client, parseTransactionFilters({ q: '%' }), null)
    expect(page.total).toBe(0)
  })
})

describe('isolamento multi-utente e AAL2', () => {
  it('A non vede conti, movimenti, aggregati e patrimonio di B', async () => {
    const [da, db] = await Promise.all([loadDashboard(a.client, SEPTEMBER, TODAY), loadDashboard(b.client, SEPTEMBER, TODAY)])
    expect(da.flows.income).toBe(EXPECTED.september.income)
    expect(db.flows.income).toBe(EXPECTED.september.income + 99900)
    expect(da.breakdown.netWorth).toBe(EXPECTED.netWorth)
    expect(db.breakdown.netWorth).toBe(EXPECTED.netWorth + 99900)
    expect(da.accounts.map((x) => x.id)).not.toEqual(expect.arrayContaining([db.accounts[0]!.id]))

    const bTx = (await listTransactions(b.client, parseTransactionFilters({ q: 'solo di B' }), null)).items[0]!
    expect(await getTransaction(a.client, bTx.id)).toBeNull()
    expect((await listTransactions(a.client, parseTransactionFilters({ q: 'solo di B' }), null)).total).toBe(0)
  })

  it('funzioni di aggregazione: zero righe in AAL1, non eseguibili da anonimo', async () => {
    const aal1 = await signIn(a)
    for (const fn of ['net_worth_history', 'dashboard_invested_at_cost'] as const) {
      const { data, error } = await aal1.rpc(fn)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
    const flows = await aal1.rpc('dashboard_monthly_flows', { p_from: '2026-01-01', p_to: '2026-12-31' })
    expect(flows.data).toEqual([])

    const anon = await anonClient().rpc('net_worth_history')
    expect(anon.error).not.toBeNull()
  })

  it('utente senza dati: nessun numero inventato', async () => {
    const d = await loadDashboard(empty.client, { period: 'this-month' }, TODAY)
    expect(d.hasData).toBe(false)
    expect(d.firstDataDate).toBeNull()
    expect(d.flows).toMatchObject({ income: 0, expenses: 0, cashFlow: 0 })
    expect(d.comparison).toEqual({ income: null, expenses: null, cashFlow: null })
    expect(d.history).toEqual([])
    expect(d.categories).toEqual([])
    expect(d.businesses.every((x) => x.margin === null)).toBe(true)
  })
})
