import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAccounts, updateAccount } from '@/server/repositories/accounts'
import { commitImport, createImportPreview, getImportDetail, setImportRowIncluded, updateImportRow } from '@/server/services/imports'
import type { ImportSource } from '@/lib/imports/types'

import { accountId, admin, createTestUser, deleteTestUser, type TestUser } from './helpers'

/**
 * Formati reali (fixture anonimizzate che riproducono struttura, encoding,
 * CRLF, NUL di riempimento, righe di saldo e duplicati degli export veri),
 * end-to-end sullo stack Supabase locale con RLS/AAL2 attive.
 * Nessun dato reale: nomi e IBAN fittizi.
 */
const file = (path: string) => {
  const bytes = new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'csv', path)))
  return { name: path.split('/').pop()!, size: bytes.length, type: 'text/csv', bytes }
}
const textFile = (text: string, name = 'test.csv') => {
  const bytes = new TextEncoder().encode(text)
  return { name, size: bytes.length, type: 'text/csv', bytes }
}

const REVOLUT_IBAN = 'IT00R0000000000000000000003'
const SAVINGS_IBAN = 'IT00A0000000000000000000002'

let a: TestUser
let b: TestUser
let ing: string
let savings: string
let revolut: string
let card: string
let trade: string

async function preview(account: string, source: ImportSource, f: ReturnType<typeof file>) {
  const result = await createImportPreview(a.client, { userId: a.id, accountId: account, source, file: f })
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value.importId
}

async function balances() {
  return Object.fromEntries((await listAccounts(a.client)).map((x) => [x.name, x.balance]))
}

async function groupOf(transactionId: string) {
  const { data } = await admin.from('transactions').select('transfer_group_id').eq('id', transactionId).single()
  const { data: legs } = await admin.from('transactions').select('account_id, amount_cents').eq('transfer_group_id', data!.transfer_group_id!)
  return legs!
}

beforeAll(async () => {
  a = await createTestUser('real-a')
  b = await createTestUser('real-b')
  ing = await accountId(a.client, 'ING Direct')
  savings = await accountId(a.client, 'ING Conto Risparmio')
  revolut = await accountId(a.client, 'Revolut')
  card = await accountId(a.client, 'Carta di credito')
  trade = await accountId(a.client, 'Trade Republic')
})

afterAll(async () => {
  await deleteTestUser(a)
  await deleteTestUser(b)
})

describe('IBAN dei conti', () => {
  it('si salva dal form del conto (forma compatta) e non può ripetersi', async () => {
    const base = { institution: null, color: null, initialBalance: 0 as never, initialBalanceOn: null }
    expect(await updateAccount(a.client, revolut, { ...base, name: 'Revolut', iban: REVOLUT_IBAN })).toEqual({ ok: true })
    expect(await updateAccount(a.client, savings, { ...base, name: 'ING Conto Risparmio', iban: SAVINGS_IBAN })).toEqual({ ok: true })
    expect(await updateAccount(a.client, card, { ...base, name: 'Carta di credito', iban: REVOLUT_IBAN })).toEqual({ ok: false, reason: 'duplicate_iban' })
    expect((await listAccounts(a.client)).find((x) => x.id === revolut)!.iban).toBe(REVOLUT_IBAN)
  })
})

describe('ING formato reale: anteprima → conferma', () => {
  let importId: string

  it('file con NUL in coda accettato; righe di saldo informative e riconciliate', async () => {
    importId = await preview(ing, 'ing', file('ing/formato-reale.csv'))
    const detail = (await getImportDetail(a.client, importId))!
    expect(detail.record).toMatchObject({ status: 'preview', rows_total: 14, rows_invalid: 0, error_message: null })
    expect(detail.file).toMatchObject({ delimiter: ';', encoding: 'utf-8' })
    const markers = detail.rows.filter((r) => r.status === 'skipped')
    expect(markers).toHaveLength(2)
    expect(markers.every((r) => r.fingerprint === null && r.amount_cents === null)).toBe(true)
    expect((markers[1]!.errors as string[]).join()).toMatch(/Riconciliazione riuscita/)
    // Una riga di saldo non si può includere: non è un movimento.
    expect(await setImportRowIncluded(a.client, markers[0]!.id, true)).toEqual({ ok: false, errors: ['Questa riga non può essere inclusa'] })
  })

  it('trasferimenti riconosciuti dall’IBAN e dalla causale, con il conto di destinazione', async () => {
    const rows = (await getImportDetail(a.client, importId))!.rows.filter((r) => r.status === 'new')
    expect(rows).toHaveLength(12)
    expect(rows.filter((r) => r.transfer_account_id === revolut)).toHaveLength(6)
    expect(rows.filter((r) => r.transfer_account_id === savings).map((r) => r.amount_cents)).toEqual([100000, 20000, -120000])
    expect(rows.filter((r) => r.transfer_account_id === card).map((r) => r.amount_cents)).toEqual([-40000])
    expect(rows.find((r) => r.amount_cents === 150000)).toMatchObject({ proposed_type: 'income' })
    expect(rows.filter((r) => r.needsReview)).toEqual([])
  })

  it('il conto di destinazione si corregge solo verso un altro conto proprio', async () => {
    const row = (await getImportDetail(a.client, importId))!.rows.find((r) => r.transfer_account_id === card)!
    const patch = { type: 'transfer' as const, categoryId: row.proposed_category_id, businessId: null, incomeSourceId: null }
    expect(await updateImportRow(a.client, row.id, { ...patch, transferAccountId: ing })).toMatchObject({ ok: false })
    const bAccount = await accountId(b.client, 'Revolut')
    expect(await updateImportRow(a.client, row.id, { ...patch, transferAccountId: bAccount })).toEqual({ ok: false, errors: ['Conto di destinazione non trovato'] })
    expect(await updateImportRow(a.client, row.id, { ...patch, transferAccountId: card })).toEqual({ ok: true, value: null })
  })

  it('conferma: contropartite su Conto Risparmio e Carta di credito, nessuna su Revolut', async () => {
    const result = await commitImport(a.client, importId)
    expect(result).toMatchObject({ ok: true, value: { imported: 12, transactions: 16 } })
    expect(await balances()).toMatchObject({ 'ING Direct': 40000, 'ING Conto Risparmio': 0, 'Carta di credito': 40000, Revolut: 0 })

    const { data: cardTx } = await admin.from('transactions').select('id, type, amount_cents').eq('account_id', card)
    expect(cardTx).toMatchObject([{ type: 'transfer', amount_cents: 40000 }])
    expect((await groupOf(cardTx![0]!.id)).map((l) => [l.account_id, l.amount_cents]).sort()).toEqual(
      [[card, 40000], [ing, -40000]].sort(),
    )
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', savings).not('transfer_group_id', 'is', null)
    expect(count).toBe(3)
    // Nessuna spesa fittizia: l'addebito carta non è un'uscita.
    const { data: expenses } = await admin.from('transactions').select('amount_cents').eq('account_id', ing).eq('type', 'expense')
    expect(expenses!.map((e) => e.amount_cents)).toEqual([-30000])
  })

  it('reimport dello stesso file: tutto duplicato, contropartite non duplicate', async () => {
    const again = await preview(ing, 'ing', file('ing/formato-reale.csv'))
    const statuses = (await getImportDetail(a.client, again))!.rows.map((r) => r.status)
    expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(12)
    expect(statuses.filter((s) => s === 'new')).toHaveLength(0)
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', savings)
    expect(count).toBe(3)
  })
})

describe('Revolut formato reale dopo ING', () => {
  let importId: string

  it('una regola aggiunta nel database si applica subito, senza deploy', async () => {
    const { data: voxel } = await a.client.from('businesses').select('id').eq('slug', 'voxel-studio').single()
    const { error } = await a.client.from('categorization_rules').insert({
      name: 'Mangopay → VOXEL (scelta utente)', priority: 10, match_type: 'contains', pattern: 'mangopay', direction: 'in',
      set_type: 'income', set_nature: 'business', set_business_id: voxel!.id, confidence: 0.9,
    })
    expect(error).toBeNull()
  })

  it('ricariche proprie abbinate uno-a-uno ai bonifici ING (anche gli importi identici)', async () => {
    importId = await preview(revolut, 'revolut', file('revolut/formato-reale.csv'))
    const rows = (await getImportDetail(a.client, importId))!.rows
    expect(rows).toHaveLength(22)
    const own = rows.filter((r) => r.description === 'Pagamento da Mario Rossi')
    expect(own).toHaveLength(6)
    expect(own.every((r) => r.proposed_type === 'transfer' && r.transfer_account_id === ing && !r.needsReview)).toBe(true)
    expect(new Set(own.map((r) => r.transfer_candidate_id)).size).toBe(6)
    expect(rows.find((r) => r.description === 'Pagamento da MANGOPAY')).toMatchObject({ proposed_type: 'income', needsReview: false })
    expect(rows.find((r) => r.description === 'Pagamento da ETSY PAYMENTS')).toMatchObject({ proposed_type: 'income' })
    expect(rows.find((r) => r.description === 'A favore di Trade Republic')).toMatchObject({ proposed_type: 'investment' })
  })

  it('conferma dopo aver escluso le righe ancora da verificare: trasferimenti collegati', async () => {
    const detail = (await getImportDetail(a.client, importId))!
    const pending = detail.rows.filter((r) => r.needsReview)
    expect(pending.map((r) => r.description).sort()).toEqual(['A favore di Luca Bianchi', 'Da parte di Luca Bianchi', 'Pagamento da PAYPAL EUROPE', 'PayPal'])
    for (const row of pending) expect((await setImportRowIncluded(a.client, row.id, false)).ok).toBe(true)
    expect((await commitImport(a.client, importId)).ok).toBe(true)

    const { data: linked } = await admin
      .from('transactions')
      .select('id')
      .eq('account_id', ing)
      .eq('amount_cents', -5000)
      .not('transfer_group_id', 'is', null)
    expect(linked).toHaveLength(4)
    const { data: revTx } = await admin.from('transactions').select('id').eq('account_id', revolut).eq('description', 'Pagamento da Mario Rossi')
    for (const tx of revTx!) {
      expect((await groupOf(tx.id)).map((l) => l.account_id).sort()).toEqual([ing, revolut].sort())
    }
  })

  it('Revolut → Trade Republic: il versamento si collega all’uscita Revolut', async () => {
    const csv =
      '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"\n' +
      '"2026-09-22T09:30:00.000Z","2026-09-22","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","100.000000","","","EUR","","","","Versamento","TEST-TR-REAL-1","Test User","","",""\n'
    const result = await createImportPreview(a.client, { userId: a.id, accountId: trade, source: 'trade_republic', file: textFile(csv) })
    if (!result.ok) throw new Error(result.errors.join())
    const [row] = (await getImportDetail(a.client, result.value.importId))!.rows
    expect(row).toMatchObject({ proposed_type: 'transfer', transfer_account_id: revolut })
    expect(row!.transfer_candidate_id).not.toBeNull()
    expect((await commitImport(a.client, result.value.importId)).ok).toBe(true)
    expect((await groupOf(row!.transfer_candidate_id!)).map((l) => l.account_id).sort()).toEqual([revolut, trade].sort())
  })

  it('patrimonio coerente: i trasferimenti non creano né distruggono denaro', async () => {
    const all = await balances()
    // ING 400 + Revolut + Carta 400 + Risparmio 0 + TR 100: la somma è entrate − spese.
    const { data } = await admin.from('transactions').select('amount_cents, type').eq('user_id', a.id)
    const net = data!.filter((t) => t.type === 'income' || t.type === 'expense' || t.type === 'refund').reduce((s, t) => s + t.amount_cents, 0)
    expect(Object.values(all).reduce((s, v) => s + v, 0)).toBe(net)
  })
})
