import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { listAccounts } from '@/server/repositories/accounts'
import {
  commitImport,
  createImportPreview,
  getImportDetail,
  setImportRowIncluded,
  updateImportRow,
} from '@/server/services/imports'
import type { ImportSource } from '@/lib/imports/types'

import { accountId, admin, createTestUser, deleteTestUser, signIn, type TestUser } from './helpers'

/**
 * Pipeline di importazione end-to-end sullo stack Supabase locale:
 * servizio → supabase-js → Storage/PostgREST → RLS/AAL2 → PostgreSQL.
 * Solo fixture sintetiche (tests/fixtures/csv).
 */
const fixturePath = (path: string) => join(__dirname, '..', 'fixtures', 'csv', path)
const file = (path: string, name = path.split('/').pop()!) => {
  const bytes = new Uint8Array(readFileSync(fixturePath(path)))
  return { name, size: bytes.length, type: 'text/csv', bytes }
}
const textFile = (text: string, name = 'test.csv') => {
  const bytes = new TextEncoder().encode(text)
  return { name, size: bytes.length, type: 'text/csv', bytes }
}

let a: TestUser
let b: TestUser
let ing: string
let revolut: string
let trade: string

async function preview(user: TestUser, account: string, source: ImportSource, f: ReturnType<typeof file>) {
  const result = await createImportPreview(user.client, { userId: user.id, accountId: account, source, file: f })
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.value.importId
}

async function balances(user: TestUser) {
  return Object.fromEntries((await listAccounts(user.client)).map((x) => [x.name, x.balance]))
}

beforeAll(async () => {
  a = await createTestUser('import-a')
  b = await createTestUser('import-b')
  ing = await accountId(a.client, 'ING Direct')
  revolut = await accountId(a.client, 'Revolut')
  trade = await accountId(a.client, 'Trade Republic')
})

afterAll(async () => {
  await deleteTestUser(a)
  await deleteTestUser(b)
})

describe('ING: anteprima → conferma → reimport', () => {
  let importId: string

  it('l’anteprima salva file, import e righe, ma nessuna transazione', async () => {
    importId = await preview(a, ing, 'ing', file('ing/fixture-utente.csv', 'ing_ottobre.csv'))
    const detail = (await getImportDetail(a.client, importId))!
    expect(detail.record).toMatchObject({ status: 'preview', bank_profile: 'ing', rows_total: 2, rows_new: 2, period_start: '2026-10-01', period_end: '2026-10-02' })
    expect(detail.file).toMatchObject({ name: 'ing_ottobre.csv', encoding: 'utf-8', delimiter: ',' })
    expect(detail.rows.map((r) => [r.status, r.proposed_type, r.needsReview])).toEqual([
      ['new', 'income', false],
      ['new', 'transfer', false],
    ])
    expect(detail.rows[0]!.raw).toEqual({ Data: '01/10/2026', Descrizione: 'STIPENDIO AZIENDA SRL', Importo: '1650.00', Saldo: '1650.00' })

    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', ing)
    expect(count).toBe(0)

    // File originale identico nello Storage privato.
    const download = await a.client.storage.from('imports').download(detail.file!.storagePath)
    expect(new Uint8Array(await download.data!.arrayBuffer())).toEqual(file('ing/fixture-utente.csv').bytes)
    expect(detail.file!.storagePath.startsWith(`${a.id}/${importId}/`)).toBe(true)
  })

  it('la conferma crea le transazioni; il saldo deriva dalle transazioni, non dalla colonna Saldo', async () => {
    const result = await commitImport(a.client, importId)
    expect(result).toEqual({ ok: true, value: { imported: 2, transactions: 2, investmentTransactions: 0 } })

    const { data } = await a.client.from('transactions').select('*').eq('account_id', ing).order('booked_on')
    expect(data!.map((t) => [t.type, t.nature, t.amount_cents, t.source, t.import_id, t.original_description])).toEqual([
      ['income', 'personal', 165000, 'csv_import', importId, 'STIPENDIO AZIENDA SRL'],
      ['transfer', 'transfer', -30000, 'csv_import', importId, 'BONIFICO A REVOLUT'],
    ])
    expect((await balances(a))['ING Direct']).toBe(135000)

    const detail = (await getImportDetail(a.client, importId))!
    expect(detail.record).toMatchObject({ status: 'committed', rows_imported: 2, income_cents: 165000, transfer_cents: 30000 })
    expect(detail.rows.every((r) => r.status === 'imported' && r.transaction_id)).toBe(true)
  })

  it('una seconda conferma non duplica nulla', async () => {
    expect(await commitImport(a.client, importId)).toEqual({ ok: false, errors: ['Importazione già confermata'] })
  })

  it('reimport dello stesso CSV: tutte le righe duplicate, nessuna nuova transazione', async () => {
    const again = await preview(a, ing, 'ing', file('ing/fixture-utente.csv'))
    const detail = (await getImportDetail(a.client, again))!
    expect(detail.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate'])
    expect(await commitImport(a.client, again)).toEqual({ ok: false, errors: ['Nessuna riga da importare'] })
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', ing)
    expect(count).toBe(2)
  })

  it('tre movimenti identici nello stesso file: tutti importati, e un reimport li riconosce', async () => {
    const first = await preview(a, ing, 'ing', file('ing/duplicati-stesso-file.csv'))
    expect((await commitImport(a.client, first)).ok).toBe(true)
    const { count } = await admin.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', ing).eq('amount_cents', -150)
    expect(count).toBe(3)
    const second = await preview(a, ing, 'ing', file('ing/duplicati-stesso-file.csv'))
    expect((await getImportDetail(a.client, second))!.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate'])
  })
})

describe('Revolut: trasferimento da ING, commissioni, righe da verificare', () => {
  let importId: string

  it('il top-up trova la gamba ING; ATM resta da verificare; valute estere escluse', async () => {
    importId = await preview(a, revolut, 'revolut', file('revolut/completo.csv'))
    const detail = (await getImportDetail(a.client, importId))!
    const byDesc = Object.fromEntries(detail.rows.map((r) => [r.description ?? (r.raw as Record<string, string>).Description, r]))
    const ingTransfer = await admin.from('transactions').select('id').eq('account_id', ing).eq('amount_cents', -30000).single()

    expect(byDesc['Top-up by *0000']).toMatchObject({ proposed_type: 'transfer', transfer_candidate_id: ingTransfer.data!.id })
    // Regola di sistema nel database: "trade republic" in uscita → investimento.
    expect(byDesc['To Trade Republic']).toMatchObject({ proposed_type: 'investment', proposed_nature: 'investment' })
    expect(byDesc['Payment from Google Ireland YouTube']).toMatchObject({ proposed_type: 'income', proposed_nature: 'business' })
    expect(byDesc['Cash at Example ATM']).toMatchObject({ proposed_type: null, needsReview: true })
    expect(detail.rows.filter((r) => r.status === 'skipped')).toHaveLength(5)
  })

  it('la conferma è bloccata finché restano righe da verificare', async () => {
    expect(await commitImport(a.client, importId)).toEqual({
      ok: false,
      errors: ['1 righe da verificare: classificale o escludile prima di confermare'],
    })
  })

  it('l’utente corregge: ATM → spesa; poi conferma', async () => {
    const detail = (await getImportDetail(a.client, importId))!
    const atm = detail.rows.find((r) => r.description === 'Cash at Example ATM')!
    expect(await updateImportRow(a.client, atm.id, { type: 'income', categoryId: null, businessId: null, incomeSourceId: null })).toEqual({
      ok: false,
      errors: ['Entrate e rimborsi devono avere importo positivo'],
    })
    expect(await updateImportRow(a.client, atm.id, { type: 'expense', categoryId: null, businessId: null, incomeSourceId: null })).toEqual({ ok: true, value: null })

    const result = await commitImport(a.client, importId)
    expect(result.ok).toBe(true)
    // 11 righe + 1 commissione separata (hotel).
    expect(result.ok && result.value).toMatchObject({ imported: 11, transactions: 12 })
  })

  it('trasferimento ING → Revolut collegato in un gruppo; patrimonio invariato dal giroconto', async () => {
    const pair = await a.client.from('transactions').select('account_id, amount_cents, transfer_group_id').in('amount_cents', [30000, -30000]).not('transfer_group_id', 'is', null)
    expect(pair.data).toHaveLength(2)
    expect(new Set(pair.data!.map((t) => t.transfer_group_id)).size).toBe(1)

    const atm = await a.client.from('transactions').select('categorization_method, is_categorized').eq('description', 'Cash at Example ATM').single()
    expect(atm.data).toEqual({ categorization_method: 'manual', is_categorized: true })

    const fee = await a.client.from('transactions').select('amount_cents, type').like('description', 'Commissione Revolut%').single()
    expect(fee.data).toEqual({ amount_cents: -120, type: 'expense' })

    // Saldo Revolut = somma delle righe importate + commissione (le righe escluse non contano).
    const expected = 30000 - 5480 + 24550 + 32000 - 20000 - 10000 + 1999 - 799 - 12000 - 120 - 10000 - 5000
    expect((await balances(a)).Revolut).toBe(expected)
  })
})

describe('Trade Republic: cassa vs operazioni su strumenti', () => {
  it('versamento collegato al PAC da Revolut (funding = trasferimento investimento)', async () => {
    const header = readFileSync(fixturePath('trade-republic/fixture-utente.csv'), 'utf8').split('\n')[0]
    const csv = `${header}\n"2026-10-06T08:00:00.000Z","2026-10-06","DEFAULT","CASH","CUSTOMER_INBOUND","","","","","","200.00","","","EUR","","","","Da Revolut","TEST-TR-LINK-1","","","",""`
    const importId = await preview(a, trade, 'trade_republic', textFile(csv))
    const detail = (await getImportDetail(a.client, importId))!
    const revolutPac = await a.client.from('transactions').select('id').eq('account_id', revolut).eq('amount_cents', -20000).single()
    expect(detail.rows[0]).toMatchObject({ proposed_type: 'transfer', transfer_candidate_id: revolutPac.data!.id })
    expect((await commitImport(a.client, importId)).ok).toBe(true)

    const legs = await a.client.from('transactions').select('type, transfer_group_id, transfer_groups(kind)').in('id', [revolutPac.data!.id, detail.rows[0]!.transaction_id ?? (await getImportDetail(a.client, importId))!.rows[0]!.transaction_id!])
    expect(legs.data!.map((l) => l.type).sort()).toEqual(['investment', 'transfer'])
    expect(new Set(legs.data!.map((l) => l.transfer_group_id)).size).toBe(1)
    expect((legs.data![0]!.transfer_groups as unknown as { kind: string }).kind).toBe('investment')
  })

  it('export completo: BUY/SELL in investment_transactions, non tra le spese; correzione del tipo sconosciuto', async () => {
    const importId = await preview(a, trade, 'trade_republic', file('trade-republic/completo.csv'))
    let detail = (await getImportDetail(a.client, importId))!
    const unknown = detail.rows.find((r) => (r.raw as Record<string, string>).type === 'CORPORATE_ACTION')!
    expect(unknown).toMatchObject({ proposed_type: null, needsReview: true })
    expect(await updateImportRow(a.client, unknown.id, { type: 'income', categoryId: null, businessId: null, incomeSourceId: null })).toMatchObject({ ok: true })

    const result = await commitImport(a.client, importId)
    expect(result).toEqual({ ok: true, value: { imported: 12, transactions: 13, investmentTransactions: 4 } })

    const trades = await a.client.from('investment_transactions').select('kind, amount_cents, fees_cents, taxes_cents, quantity, cash_transaction_id, instruments(isin)').eq('account_id', trade).order('trade_on')
    expect(trades.data!.map((t) => [t.kind, t.amount_cents, t.fees_cents, t.taxes_cents, (t.instruments as unknown as { isin: string }).isin])).toEqual([
      ['buy', -20000, 100, 0, 'IE00B4L5Y983'],
      ['buy', -5000, 0, 0, 'IE00B5BMR087'],
      ['sell', 15000, 100, 500, 'US0000000001'],
      ['dividend', 340, 0, 60, 'US0000000001'],
    ])
    expect(trades.data![3]!.cash_transaction_id).not.toBeNull()

    // Nessun acquisto tra le transazioni di cassa.
    const buyAsExpense = await a.client.from('transactions').select('id').eq('account_id', trade).eq('amount_cents', -20000)
    expect(buyAsExpense.data).toEqual([])

    // Saldo TR (liquidità al costo): versamenti − prelievi + proventi − costi; gli acquisti non lo riducono.
    const expected = 20000 /* collegato */ + 50000 + 10000 + 340 + 215 + 5 + 1200 - 100 - 80 - 10000 - 100 - 100 - 500 - 60
    expect((await balances(a))['Trade Republic']).toBe(expected)

    detail = (await getImportDetail(a.client, importId))!
    expect(detail.record.status).toBe('committed')
  })

  it('reimport Trade Republic: transaction_id già visti → duplicati (anche le operazioni su titoli)', async () => {
    const again = await preview(a, trade, 'trade_republic', file('trade-republic/completo.csv'))
    const statuses = (await getImportDetail(a.client, again))!.rows.map((r) => r.status)
    expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(12)
  })

  it('stesso transaction_id ripetuto nello stesso file: importato una volta sola', async () => {
    const importId = await preview(a, trade, 'trade_republic', file('trade-republic/duplicati-id.csv'))
    const detail = (await getImportDetail(a.client, importId))!
    expect(detail.rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'new'])
  })
})

describe('Sicurezza: AAL2, RLS e isolamento', () => {
  it('sessione AAL1: impossibile creare un’importazione', async () => {
    const aal1 = await signIn(a)
    const result = await createImportPreview(aal1, { userId: a.id, accountId: ing, source: 'ing', file: file('ing/fixture-utente.csv') })
    expect(result).toEqual({ ok: false, errors: ['Conto non trovato'] })
  })

  it('B non vede importazioni, righe, file né transazioni di A', async () => {
    const { data: imports } = await admin.from('imports').select('id').eq('user_id', a.id).limit(1)
    const importId = imports![0]!.id
    expect(await getImportDetail(b.client, importId)).toBeNull()
    expect((await b.client.from('import_rows').select('id').eq('import_id', importId)).data).toEqual([])
    expect((await b.client.from('import_files').select('id').eq('import_id', importId)).data).toEqual([])
    expect((await b.client.from('transactions').select('id').eq('account_id', ing)).data).toEqual([])

    const { data: files } = await admin.from('import_files').select('storage_path').eq('import_id', importId)
    const download = await b.client.storage.from('imports').download(files![0]!.storage_path)
    expect(download.data).toBeNull()
  })

  it('B non può modificare righe né confermare importazioni di A', async () => {
    const { data: pendingImports } = await admin.from('imports').select('id').eq('user_id', a.id).eq('status', 'preview').limit(1)
    const importId = pendingImports![0]!.id
    const { data: rows } = await admin.from('import_rows').select('id').eq('import_id', importId).limit(1)
    expect(await updateImportRow(b.client, rows![0]!.id, { type: 'expense', categoryId: null, businessId: null, incomeSourceId: null })).toEqual({
      ok: false,
      errors: ['Riga non trovata'],
    })
    expect(await setImportRowIncluded(b.client, rows![0]!.id, false)).toEqual({ ok: false, errors: ['Riga non trovata'] })
    expect(await commitImport(b.client, importId)).toEqual({ ok: false, errors: ['Importazione non trovata'] })
  })

  it('B non può importare sul conto di A', async () => {
    const result = await createImportPreview(b.client, { userId: b.id, accountId: ing, source: 'ing', file: file('ing/fixture-utente.csv') })
    expect(result).toEqual({ ok: false, errors: ['Conto non trovato'] })
  })
})
