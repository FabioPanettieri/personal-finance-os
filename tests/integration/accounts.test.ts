import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { balanceSeries, movementsInBalanceWindow, summarizeFlows, totalsByCurrency } from '@/lib/accounts'
import { toIsoDate } from '@/lib/dates'
import { cents } from '@/lib/money'
import {
  getAccount,
  listAccountMovements,
  listAccounts,
  setAccountActive,
  updateAccount,
} from '@/server/repositories/accounts'

import { accountId, anonClient, createTestUser, deleteTestUser, fingerprint, type TestUser } from './helpers'

/**
 * Percorso completo: repository → supabase-js → API locale → PostgREST →
 * PostgreSQL → RLS. Dati interamente sintetici, utenti creati e cancellati qui.
 */
let a: TestUser
let b: TestUser
let aIng: string
let aRevolut: string
let aTrade: string

const totalOf = async (user: TestUser) => {
  const accounts = await listAccounts(user.client)
  return totalsByCurrency(accounts.map((x) => ({ currency: x.currency, balance: x.balance, kind: x.type.kind })))[0]!
}

beforeAll(async () => {
  a = await createTestUser('a')
  b = await createTestUser('b')
  aIng = await accountId(a.client, 'ING Direct')
  aRevolut = await accountId(a.client, 'Revolut')
  aTrade = await accountId(a.client, 'Trade Republic')
})

afterAll(async () => {
  await deleteTestUser(a)
  await deleteTestUser(b)
})

describe('bootstrap e lettura', () => {
  it('l’utente creato riceve i 5 conti di default, di sua proprietà', async () => {
    const accounts = await listAccounts(a.client)
    expect(accounts.map((x) => x.name)).toEqual(['ING Direct', 'ING Conto Risparmio', 'Revolut', 'Carta di credito', 'Trade Republic'])
    expect(accounts.map((x) => x.type.code)).toEqual(['checking', 'savings', 'checking', 'card', 'broker'])
    expect(accounts.every((x) => x.currency === 'EUR' && x.isActive && x.balance === 0 && x.transactionCount === 0)).toBe(true)

    const { data } = await a.client.from('accounts').select('user_id')
    expect(new Set(data!.map((r) => r.user_id))).toEqual(new Set([a.id]))
  })

  it('istituto e tipo arrivano dal join con account_types', async () => {
    const trade = await getAccount(a.client, aTrade)
    expect(trade).toMatchObject({ institution: 'Trade Republic', type: { code: 'broker', kind: 'investment' } })
  })
})

describe('RLS sull’API reale', () => {
  it('B vede solo i propri conti', async () => {
    const accounts = await listAccounts(b.client)
    expect(accounts).toHaveLength(5)
    expect(accounts.map((x) => x.id)).not.toContain(aIng)
  })

  it('B non legge un conto di A neppure conoscendone l’id', async () => {
    expect(await getAccount(b.client, aIng)).toBeNull()
  })

  it('B non può modificare né disattivare i conti di A', async () => {
    const update = await updateAccount(b.client, aIng, {
      name: 'Preso da B',
      institution: null,
      color: null,
      initialBalance: cents(999_999),
      initialBalanceOn: null,
    })
    expect(update).toEqual({ ok: false, reason: 'not_found' })
    expect(await setAccountActive(b.client, aIng, false)).toEqual({ ok: false, reason: 'not_found' })

    const untouched = await getAccount(a.client, aIng)
    expect(untouched).toMatchObject({ name: 'ING Direct', isActive: true, initialBalance: 0 })
  })

  it('un client non autenticato non vede conti né saldi', async () => {
    const anon = anonClient()
    const accounts = await anon.from('accounts').select('id')
    expect(accounts.error?.code).toBe('42501')
    const balances = await anon.from('account_balances').select('account_id')
    expect(balances.error?.code).toBe('42501')
  })
})

describe('saldi, flussi e trasferimenti', () => {
  it('il saldo deriva dalla vista e i trasferimenti interni non creano patrimonio', async () => {
    const before = await totalOf(a)
    expect(before.total).toBe(0)

    const { data: groups, error: groupError } = await a.client
      .from('transfer_groups')
      .insert([
        { kind: 'internal', detected_by: 'manual' },
        { kind: 'investment', detected_by: 'manual' },
      ])
      .select('id')
    expect(groupError).toBeNull()
    const [internal, investment] = groups!

    const rows = [
      // Stipendio e mutuo su ING.
      { account_id: aIng, booked_on: '2026-09-01', amount_cents: 210050, type: 'income', nature: 'personal' },
      { account_id: aIng, booked_on: '2026-09-03', amount_cents: -65000, type: 'expense', nature: 'personal' },
      // Giroconto ING → Revolut: due gambe dello stesso gruppo.
      { account_id: aIng, booked_on: '2026-09-05', amount_cents: -50000, type: 'transfer', nature: 'transfer', transfer_group_id: internal!.id },
      { account_id: aRevolut, booked_on: '2026-09-05', amount_cents: 50000, type: 'transfer', nature: 'transfer', transfer_group_id: internal!.id },
      // Spesa e rimborso su Revolut.
      { account_id: aRevolut, booked_on: '2026-09-07', amount_cents: -4250, type: 'expense', nature: 'personal' },
      { account_id: aRevolut, booked_on: '2026-09-09', amount_cents: 1250, type: 'refund', nature: 'personal' },
      // PAC Revolut → Trade Republic: investimento lato liquidità, trasferimento lato broker.
      { account_id: aRevolut, booked_on: '2026-09-15', amount_cents: -20000, type: 'investment', nature: 'investment', transfer_group_id: investment!.id },
      { account_id: aTrade, booked_on: '2026-09-15', amount_cents: 20000, type: 'transfer', nature: 'transfer', transfer_group_id: investment!.id },
    ] as const

    const { error } = await a.client.from('transactions').insert(
      rows.map((row, i) => ({
        ...row,
        description: `Movimento sintetico ${i}`,
        original_description: `SINTETICO ${i}`,
        fingerprint: fingerprint(`${a.id}-${i}`),
      })),
    )
    expect(error).toBeNull()

    const accounts = await listAccounts(a.client)
    const byName = Object.fromEntries(accounts.map((x) => [x.name, x]))
    expect(byName['ING Direct']).toMatchObject({ balance: 95050, transactionCount: 3, lastTransactionOn: '2026-09-05' })
    expect(byName.Revolut).toMatchObject({ balance: 27000, transactionCount: 4, lastTransactionOn: '2026-09-15' })
    expect(byName['Trade Republic']).toMatchObject({ balance: 20000, transactionCount: 1 })

    // Patrimonio = solo entrate − spese nette: 2.100,50 − 650,00 − 42,50 + 12,50.
    const after = await totalOf(a)
    expect(after.total).toBe(210050 - 65000 - 4250 + 1250)
    expect(after).toMatchObject({ liquid: 95050 + 27000, investment: 20000 })
  })

  it('dettaglio conto: flussi coerenti con il saldo della vista', async () => {
    const revolut = (await getAccount(a.client, aRevolut))!
    const movements = await listAccountMovements(a.client, aRevolut)
    const flows = summarizeFlows(movementsInBalanceWindow(movements, revolut.initialBalanceOn))

    expect(flows).toMatchObject({
      income: 0,
      netExpenses: 3000,
      transfersIn: 50000,
      transfersOut: 0,
      investedOut: 20000,
      movementCount: 4,
    })
    expect(revolut.initialBalance + flows.netChange).toBe(revolut.balance)

    const series = balanceSeries(movements, revolut.initialBalance, revolut.initialBalanceOn)
    expect(series.at(-1)!.balance).toBe(revolut.balance)
  })

  it('il saldo iniziale modificato dall’utente si riflette sul saldo calcolato', async () => {
    const result = await updateAccount(a.client, aIng, {
      name: 'ING Direct',
      institution: 'ING',
      color: '#FF6200',
      initialBalance: cents(1_000_000),
      initialBalanceOn: toIsoDate('2026-09-02'),
    })
    expect(result).toEqual({ ok: true })

    // Lo stipendio del 01/09 è prima della data del saldo iniziale: escluso, come nella vista.
    const ing = (await getAccount(a.client, aIng))!
    expect(ing.balance).toBe(1_000_000 - 65000 - 50000)
    const movements = await listAccountMovements(a.client, aIng)
    expect(balanceSeries(movements, ing.initialBalance, ing.initialBalanceOn).at(-1)!.balance).toBe(ing.balance)
  })

  it('nome duplicato rifiutato con un errore leggibile', async () => {
    const result = await updateAccount(a.client, aIng, {
      name: 'Revolut',
      institution: null,
      color: null,
      initialBalance: cents(0),
      initialBalanceOn: null,
    })
    expect(result).toEqual({ ok: false, reason: 'duplicate_name' })
  })

  it('attivazione/disattivazione', async () => {
    expect(await setAccountActive(a.client, aTrade, false)).toEqual({ ok: true })
    expect((await getAccount(a.client, aTrade))!.isActive).toBe(false)
    expect(await setAccountActive(a.client, aTrade, true)).toEqual({ ok: true })
  })

  it('le modifiche finiscono nell’audit log, visibile solo al proprietario', async () => {
    const own = await a.client.from('audit_logs').select('table_name, action').eq('table_name', 'accounts').eq('action', 'update')
    expect(own.data!.length).toBeGreaterThanOrEqual(3)
    const other = await b.client.from('audit_logs').select('id').eq('record_id', aIng)
    expect(other.data).toEqual([])
  })
})

describe('paginazione oltre il limite di PostgREST', () => {
  it('una query singola si ferma a 1000 righe, listAccountMovements le legge tutte', async () => {
    const bIng = await accountId(b.client, 'ING Direct')
    const count = 1205
    const rows = Array.from({ length: count }, (_, i) => ({
      account_id: bIng,
      booked_on: `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`,
      amount_cents: -(100 + i),
      type: 'expense' as const,
      nature: 'personal' as const,
      description: `Spesa sintetica ${i}`,
      original_description: `SPESA ${i}`,
      fingerprint: fingerprint(`${b.id}-${i}`),
    }))
    const { error } = await b.client.from('transactions').insert(rows)
    expect(error).toBeNull()

    const single = await b.client.from('transactions').select('id').eq('account_id', bIng)
    expect(single.data!.length).toBe(1000)

    const movements = await listAccountMovements(b.client, bIng)
    expect(movements).toHaveLength(count)
    const account = (await getAccount(b.client, bIng))!
    expect(account.transactionCount).toBe(count)
    expect(summarizeFlows(movements).netChange).toBe(account.balance)
  })
})
