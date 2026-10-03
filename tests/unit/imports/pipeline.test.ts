import { describe, expect, it } from 'vitest'

import { classify } from '@/lib/categorization/engine'
import type { Rule } from '@/lib/categorization/rules'

import { SEED_RULES } from './seed-rules'
import { toIsoDate } from '@/lib/dates'
import { cents } from '@/lib/money'
import { assignOccurrences, fingerprintFor } from '@/lib/imports/fingerprint'
import { analyzeCsv, fingerprintRows, summarizePreview, validateFile } from '@/lib/imports/pipeline'
import type { Counterpart } from '@/lib/transfers/detect'

import { bytes, CONTEXT, fixture, LOOKUPS, normalized, preview } from './helpers'

describe('validazione del file', () => {
  const ok = { name: 'estratto.csv', size: 10, type: 'text/csv', bytes: bytes('a,b\n1,2') }
  it('accetta un CSV', () => expect(validateFile(ok)).toEqual([]))
  it('rifiuta estensione, tipo, file vuoti, troppo grandi o binari', () => {
    expect(validateFile({ ...ok, name: 'estratto.xlsx' })).toContain('Il file deve avere estensione .csv')
    expect(validateFile({ ...ok, type: 'application/pdf' })[0]).toMatch(/Tipo di file non ammesso/)
    expect(validateFile({ ...ok, size: 0, bytes: new Uint8Array() })).toContain('Il file è vuoto')
    expect(validateFile({ ...ok, size: 11 * 1024 * 1024 })).toContain('Il file supera 10 MB')
    expect(validateFile({ ...ok, bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0x08, 0]) })[0]).toMatch(/binario/)
  })
})

describe('classificazione', () => {
  const rows = (source: 'ing' | 'revolut' | 'trade_republic', path: string) =>
    normalized(source, fixture(path)).map((tx) => ({ tx, c: classify({ ...tx, accountId: 'acc-1' }, SEED_RULES, LOOKUPS) }))

  it('ING: stipendio → entrata con fonte e categoria; bonifico a Revolut → trasferimento', () => {
    const [salary, transfer] = rows('ing', 'ing/fixture-utente.csv')
    expect(salary!.c).toMatchObject({
      type: 'income',
      nature: 'personal',
      categoryId: 'cat:Stipendio',
      incomeSourceId: 'src:Stipendio',
      needsReview: false,
    })
    expect(transfer!.c).toMatchObject({ type: 'transfer', nature: 'transfer', categoryId: 'cat:Trasferimenti > Giroconto' })
  })

  it('ING completo: spesa, mutuo, rimborso; bonifico ricevuto e operazione ignota da verificare', () => {
    const byDesc = Object.fromEntries(rows('ing', 'ing/completo.csv').map((r) => [r.tx.description, r.c]))
    expect(byDesc['PAGAMENTO POS ESSELUNGA MILANO']).toMatchObject({ type: 'expense', categoryId: 'cat:Alimentazione > Spesa' })
    expect(byDesc['ADDEBITO RATA MUTUO N. 0000000']).toMatchObject({ type: 'expense', categoryId: 'cat:Casa > Mutuo' })
    expect(byDesc['RIMBORSO SPESE ASSICURAZIONE ESEMPIO']).toMatchObject({ type: 'refund' })
    expect(byDesc['BONIFICO RICEVUTO DA MARIO ESEMPIO']).toMatchObject({ type: null, needsReview: true })
    expect(byDesc['BONIFICO RICEVUTO DA MARIO ESEMPIO']!.reasons.join()).toMatch(/entrata o trasferimento/)
    expect(byDesc['OPERAZIONE SCONOSCIUTA XYZ']).toMatchObject({ type: null, needsReview: true, method: 'none' })
  })

  it('Revolut: YouTube → entrata business, VOXEL → entrata business, verso Trade Republic → investimento', () => {
    const byDesc = Object.fromEntries(rows('revolut', 'revolut/completo.csv').map((r) => [r.tx.description, r.c]))
    expect(byDesc['Payment from Google Ireland YouTube']).toMatchObject({
      type: 'income',
      nature: 'business',
      incomeSourceId: 'src:YouTube',
      businessId: 'biz:il-progettista-meccanico',
    })
    expect(byDesc['Payment from VOXEL Studio']).toMatchObject({ type: 'income', nature: 'business', businessId: 'biz:voxel-studio' })
    expect(byDesc['Esselunga']).toMatchObject({ type: 'expense', categoryId: 'cat:Alimentazione > Spesa' })
    expect(byDesc['To ING Direct']).toMatchObject({ type: 'transfer' })
    expect(byDesc['Cash at Example ATM']).toMatchObject({ type: null, needsReview: true })
    // Regola iniziale del database (0004): verso Trade Republic = investimento, non spesa.
    expect(byDesc['To Trade Republic']).toMatchObject({ type: 'investment', nature: 'investment' })
  })

  it('le regole dell’utente nel database hanno la precedenza sulle predefinite', () => {
    const userRule: Rule = {
      id: 'db-1', dbId: 'db-1', name: 'Amazon per VOXEL', priority: 10, matchField: 'description', matchType: 'contains',
      pattern: 'amazon', accountId: null, direction: 'out', amountMinCents: null, amountMaxCents: null,
      setType: 'expense', setNature: 'business', setCategoryId: 'cat-business', setBusinessId: 'biz:voxel-studio', confidence: 0.95,
    }
    const c = classify(
      { source: 'revolut', description: 'Amazon EU', counterparty: null, amount: cents(-3000), hint: null, movement: 'cash', accountId: 'acc-1' },
      [...SEED_RULES, userRule],
      LOOKUPS,
    )
    expect(c).toMatchObject({ type: 'expense', nature: 'business', businessId: 'biz:voxel-studio', ruleDbId: 'db-1', confidence: 0.95 })
  })

  it('mai un tipo incompatibile con il segno', () => {
    const c = classify(
      { source: 'ing', description: 'STIPENDIO RESTITUITO', counterparty: null, amount: cents(-1000), hint: null, movement: 'cash', accountId: 'acc-1' },
      SEED_RULES,
      LOOKUPS,
    )
    expect(c.type).not.toBe('income')
  })

  it('Trade Republic: BUY è investimento (nessuna categoria di spesa), le parole chiave non lo cambiano', () => {
    const [, buy] = rows('trade_republic', 'trade-republic/fixture-utente.csv')
    expect(buy!.c).toMatchObject({ type: 'investment', nature: 'investment', categoryId: null, confidence: 0.99 })
  })
})

describe('duplicati', () => {
  it('due transazioni identiche nello stesso file coesistono (occorrenza 0, 1, 2)', async () => {
    const txs = normalized('ing', fixture('ing/duplicati-stesso-file.csv'))
    expect(assignOccurrences(txs)).toEqual([0, 1, 2])
    const fps = await Promise.all(txs.map((tx, i) => fingerprintFor(tx, 'acc-1', i)))
    expect(new Set(fps).size).toBe(3)
    const rows = await preview('ing', fixture('ing/duplicati-stesso-file.csv'))
    expect(rows.map((r) => r.status)).toEqual(['new', 'new', 'new'])
  })

  it('reimport identico: tutte duplicate', async () => {
    const first = await preview('ing', fixture('ing/completo.csv'))
    const existing = first.map((r, i) => ({ id: `tx-${i}`, fingerprint: r.fingerprint!, bookedOn: r.transaction!.bookedOn, amount: r.transaction!.amount }))
    const again = await preview('ing', fixture('ing/completo.csv'), { existingCash: existing })
    expect(again.map((r) => r.status)).toEqual(Array(9).fill('duplicate'))
    expect(again[0]!.duplicateOfId).toBe('tx-0')
  })

  it('il fingerprint dipende dal conto (stesso file su un altro conto non è duplicato)', async () => {
    const a = await preview('ing', fixture('ing/fixture-utente.csv'), {}, 'acc-1')
    const b = await preview('ing', fixture('ing/fixture-utente.csv'), {}, 'acc-2')
    expect(a[0]!.fingerprint).not.toBe(b[0]!.fingerprint)
  })

  it('transaction_id identico → duplicato anche nello stesso file; diverso → nuovo', async () => {
    const rows = await preview('trade_republic', fixture('trade-republic/duplicati-id.csv'))
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'new'])
  })

  it('transaction_id: fingerprint stabile anche se cambia la descrizione', async () => {
    const tx = normalized('trade_republic', fixture('trade-republic/fixture-utente.csv'))[0]!
    expect(await fingerprintFor(tx, 'acc-1', 0)).toBe(await fingerprintFor({ ...tx, description: 'altro testo' }, 'acc-9', 5))
  })

  it('movimento esistente con stesso importo entro ±2 giorni → possibile duplicato da verificare', async () => {
    const rows = await preview('revolut', fixture('revolut/fixture-utente.csv'), {
      existingCash: [{ id: 'manual-1', fingerprint: 'x'.repeat(64), bookedOn: toIsoDate('2026-10-03'), amount: -5480 }],
    })
    expect(rows[1]).toMatchObject({ status: 'possible_duplicate', needsReview: true, duplicateOfId: 'manual-1' })
    expect(rows[0]!.status).toBe('new')
  })

  it('operazioni su titoli: deduplicate contro investment_transactions', async () => {
    const first = await preview('trade_republic', fixture('trade-republic/fixture-utente.csv'))
    const again = await preview('trade_republic', fixture('trade-republic/fixture-utente.csv'), {
      existingTradeFingerprints: new Set([first[1]!.fingerprint!]),
    })
    expect(again.map((r) => r.status)).toEqual(['new', 'duplicate'])
  })
})

describe('trasferimenti', () => {
  const ing: Counterpart = { id: 'ing-tx', accountId: 'acc-ing', accountName: 'ING Direct', accountKind: 'liquid', bookedOn: toIsoDate('2026-10-02'), amount: -30000, type: 'transfer' }

  it('ING → Revolut: il top-up Revolut trova la gamba ING', async () => {
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTOPUP,Current,2026-10-03 09:00:00,2026-10-03 09:00:00,Top-up,300.00,0.00,EUR,COMPLETED,300.00'
    const [row] = await preview('revolut', bytes(csv), { counterparts: [ing] })
    expect(row).toMatchObject({ transferCandidateId: 'ing-tx', classification: { type: 'transfer', nature: 'transfer' } })
  })

  it('Revolut → ING: anche un "bonifico ricevuto" da verificare viene risolto dalla controparte', async () => {
    const revolutOut: Counterpart = { id: 'rev-tx', accountId: 'acc-rev', accountName: 'Revolut', accountKind: 'liquid', bookedOn: toIsoDate('2026-10-06'), amount: -12000, type: 'transfer' }
    const rows = await preview('ing', fixture('ing/completo.csv'), { counterparts: [revolutOut] })
    const received = rows.find((r) => r.transaction?.description === 'BONIFICO RICEVUTO DA MARIO ESEMPIO')!
    expect(received).toMatchObject({ transferCandidateId: 'rev-tx', needsReview: false, classification: { type: 'transfer' } })
  })

  it('Revolut → Trade Republic: lato Revolut è investimento (funding), lato TR è trasferimento', async () => {
    const tr: Counterpart = { id: 'tr-tx', accountId: 'acc-tr', accountName: 'Trade Republic', accountKind: 'investment', bookedOn: toIsoDate('2026-10-05'), amount: 20000, type: 'transfer' }
    const rows = await preview('revolut', fixture('revolut/completo.csv'), { counterparts: [tr] })
    const out = rows.find((r) => r.transaction?.description === 'To Trade Republic')!
    expect(out).toMatchObject({ transferCandidateId: 'tr-tx', classification: { type: 'investment', nature: 'investment', categoryId: 'cat:Investimenti > Versamenti' } })

    const revolut: Counterpart = { id: 'rev-tx', accountId: 'acc-rev', accountName: 'Revolut', accountKind: 'liquid', bookedOn: toIsoDate('2026-10-01'), amount: -20000, type: 'investment' }
    const trRows = await preview('trade_republic', fixture('trade-republic/fixture-utente.csv'), { counterparts: [revolut] })
    expect(trRows[0]).toMatchObject({ transferCandidateId: 'rev-tx', classification: { type: 'transfer', nature: 'transfer' } })
    expect(trRows[1]!.transferCandidateId).toBeNull() // il BUY non è un trasferimento
  })

  it('due controparti compatibili sullo stesso conto: abbinamento alla più vicina in data', async () => {
    const twin: Counterpart = { ...ing, id: 'ing-tx-2', bookedOn: toIsoDate('2026-10-03') }
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTOPUP,Current,2026-10-03 09:00:00,2026-10-03 09:00:00,Top-up,300.00,0.00,EUR,COMPLETED,300.00'
    const [row] = await preview('revolut', bytes(csv), { counterparts: [ing, twin] })
    expect(row!.transferCandidateId).toBe('ing-tx-2')
  })

  it('controparti compatibili su conti diversi: nessun collegamento automatico', async () => {
    const other: Counterpart = { ...ing, id: 'sav-tx', accountId: 'acc-sav', accountName: 'ING Conto Risparmio' }
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTOPUP,Current,2026-10-03 09:00:00,2026-10-03 09:00:00,Top-up,300.00,0.00,EUR,COMPLETED,300.00'
    const [row] = await preview('revolut', bytes(csv), { counterparts: [ing, other] })
    expect(row!.transferCandidateId).toBeNull()
    expect(row!.messages.join()).toMatch(/Più movimenti compatibili/)
  })

  it('stesso importo opposto ma controparte di tipo spesa: non è un trasferimento', async () => {
    const expense: Counterpart = { ...ing, type: 'expense' }
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\nTOPUP,Current,2026-10-03 09:00:00,2026-10-03 09:00:00,Top-up,300.00,0.00,EUR,COMPLETED,300.00'
    const [row] = await preview('revolut', bytes(csv), { counterparts: [expense] })
    expect(row!.transferCandidateId).toBeNull()
  })
})

describe('anteprima', () => {
  it('riepilogo: trovate, pronte, da verificare, duplicate, escluse', async () => {
    const rows = await preview('revolut', fixture('revolut/completo.csv'))
    const summary = summarizePreview(rows)
    expect(summary).toMatchObject({ total: 16, skipped: 5, invalid: 0, duplicates: 0 })
    expect(summary.ready + summary.toReview).toBe(11)
    // Da verificare: la ricarica (da un tuo conto o da terzi?) e il prelievo ATM.
    expect(rows.filter((r) => r.needsReview).map((r) => r.transaction!.description)).toEqual(['Top-up by *0000', 'Cash at Example ATM'])
    expect(summary.periodStart).toBe('2026-10-02')
    expect(summary.periodEnd).toBe('2026-10-16')
  })

  it('le righe escluse conservano il motivo e la riga originale', async () => {
    const rows = await preview('revolut', fixture('revolut/completo.csv'))
    const reverted = rows.find((r) => r.status === 'skipped' && r.raw.State === 'REVERTED')!
    expect(reverted.messages[0]).toMatch(/stornata/)
    expect(reverted.raw.Description).toBe('Ticket Example')
  })

  it('fingerprintRows lascia senza fingerprint solo le righe non valide/escluse', async () => {
    const result = analyzeCsv(fixture('revolut/completo.csv'), 'revolut', CONTEXT)
    if (!result.ok) throw new Error()
    const rows = await fingerprintRows(result.analysis, 'acc-1')
    expect(rows.filter((r) => r.fingerprint === null)).toHaveLength(5)
  })
})
