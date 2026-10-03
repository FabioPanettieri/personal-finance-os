import { describe, expect, it } from 'vitest'

import { analyzeCsv } from '@/lib/imports/pipeline'
import { detectSource } from '@/lib/imports/importers'

import { bytes, CONTEXT, fixture, normalized } from './helpers'

describe('riconoscimento della fonte', () => {
  it.each([
    ['ing/fixture-utente.csv', 'ing'],
    ['ing/completo.csv', 'ing'],
    ['revolut/fixture-utente.csv', 'revolut'],
    ['revolut/completo.csv', 'revolut'],
    ['trade-republic/fixture-utente.csv', 'trade_republic'],
    ['trade-republic/completo.csv', 'trade_republic'],
  ] as const)('%s → %s', (path, expected) => {
    const text = new TextDecoder().decode(fixture(path))
    const delimiter = path.includes('completo') && path.startsWith('ing') ? ';' : ','
    const headers = text.split('\n')[0]!.split(delimiter).map((h) => h.replace(/"/g, ''))
    expect(detectSource(headers).best).toBe(expected)
  })

  it('blocca un file della banca sbagliata', () => {
    const result = analyzeCsv(fixture('trade-republic/fixture-utente.csv'), 'ing', CONTEXT)
    expect(result).toEqual({ ok: false, errors: ['Il file sembra un export Trade Republic, non ING. Scegli la banca corretta.'] })
  })

  it('segnala le colonne obbligatorie mancanti', () => {
    const result = analyzeCsv(bytes('Data,Note\n01/10/2026,x'), 'ing', CONTEXT)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]).toMatch(/Colonne obbligatorie mancanti per ING Direct: description/)
  })
})

describe('INGImporter', () => {
  it('fixture utente: data, descrizione, importo e saldo solo informativo', () => {
    const [salary, transfer] = normalized('ing', fixture('ing/fixture-utente.csv'))
    expect(salary).toMatchObject({
      source: 'ing',
      bookedOn: '2026-10-01',
      description: 'STIPENDIO AZIENDA SRL',
      originalDescription: 'STIPENDIO AZIENDA SRL',
      amount: 165000,
      currency: 'EUR',
      reportedBalance: 165000,
      externalId: null,
      movement: 'cash',
      hint: null,
      raw: { Data: '01/10/2026', Descrizione: 'STIPENDIO AZIENDA SRL', Importo: '1650.00', Saldo: '1650.00' },
    })
    expect(transfer).toMatchObject({ bookedOn: '2026-10-02', amount: -30000, reportedBalance: 135000 })
  })

  it('formato italiano con ";" , data valuta e importi "1.650,00"', () => {
    const rows = normalized('ing', fixture('ing/completo.csv'))
    expect(rows).toHaveLength(9)
    expect(rows[0]).toMatchObject({ amount: 165000, valueOn: '2026-10-01', reportedBalance: 215000 })
    expect(rows[2]).toMatchObject({ description: 'PAGAMENTO POS ESSELUNGA MILANO', amount: -6235 })
  })

  it('colonne Entrate/Uscite separate', () => {
    const [income, expense] = normalized('ing', bytes('Data;Descrizione;Entrate;Uscite\n01/10/2026;Accredito;100,00;\n02/10/2026;Pagamento;;25,50'))
    expect(income!.amount).toBe(10000)
    expect(expense!.amount).toBe(-2550)
  })

  it('righe con data o importo non validi sono "invalid", non crash', () => {
    const result = analyzeCsv(bytes('Data,Descrizione,Importo\n31/02/2026,X,1.00\n01/10/2026,Y,abc\n01/10/2026,Z,0.00'), 'ing', CONTEXT)
    if (!result.ok) throw new Error('atteso ok')
    expect(result.analysis.outcomes.map((o) => o.kind)).toEqual(['invalid', 'invalid', 'skipped'])
  })
})

describe('RevolutImporter', () => {
  it('fixture utente ridotta (Date, Description, Amount)', () => {
    const rows = normalized('revolut', fixture('revolut/fixture-utente.csv'))
    expect(rows.map((r) => [r.bookedOn, r.description, r.amount])).toEqual([
      ['2026-10-01', 'YouTube Payment', 24550],
      ['2026-10-02', 'Supermarket', -5480],
    ])
  })

  it('export completo: stati, prodotti e valute esclusi con motivazione', () => {
    const result = analyzeCsv(fixture('revolut/completo.csv'), 'revolut', CONTEXT)
    if (!result.ok) throw new Error(result.errors.join())
    const skipped = result.analysis.outcomes.flatMap((o) => (o.kind === 'skipped' ? [o.reason] : []))
    expect(skipped).toEqual([
      expect.stringMatching(/Valuta USD diversa/),
      expect.stringMatching(/Valuta USD diversa/),
      expect.stringMatching(/REVERTED/),
      expect.stringMatching(/in sospeso/),
      expect.stringMatching(/prodotto "Savings"/),
    ])
    expect(result.analysis.outcomes.filter((o) => o.kind === 'ok')).toHaveLength(11)
  })

  it('usa la data di completamento e conserva il tipo grezzo', () => {
    const rows = normalized('revolut', fixture('revolut/completo.csv'))
    const card = rows.find((r) => r.description === 'Esselunga')!
    expect(card).toMatchObject({ bookedOn: '2026-10-03', sourceType: 'CARD_PAYMENT', amount: -5480, hint: { type: 'expense' } })
  })

  it('commissione come movimento separato (il saldo resta corretto)', () => {
    const hotel = normalized('revolut', fixture('revolut/completo.csv')).find((r) => r.description === 'Hotel Example London')!
    expect(hotel.amount).toBe(-12000)
    expect(hotel.fee).toBe(120)
    expect(hotel.secondary).toEqual([{ part: 'fee', amount: -120, description: 'Commissione Revolut · Hotel Example London' }])
  })

  it('significato strutturale di top-up, rimborsi, commissioni e cambi', () => {
    const rows = normalized('revolut', fixture('revolut/completo.csv'))
    const hint = (d: string) => rows.find((r) => r.description === d)!.hint
    // Una ricarica non è mai un trasferimento automatico: può essere un incasso da terzi.
    expect(hint('Top-up by *0000')).toMatchObject({ type: null, confidence: 0 })
    expect(hint('Amazon refund')).toMatchObject({ type: 'refund' })
    expect(hint('Premium plan fee')).toMatchObject({ type: 'expense' })
    expect(hint('Exchanged to USD')).toMatchObject({ type: 'transfer' })
    // Un TRANSFER non dice da solo se è entrata, spesa o giroconto.
    expect(hint('Payment from VOXEL Studio')).toBeNull()
    expect(hint('Cash at Example ATM')).toBeNull()
  })
})

describe('TradeRepublicImporter', () => {
  it('fixture utente: versamento (cash) e acquisto ETF (trade, non spesa)', () => {
    const [deposit, buy] = normalized('trade_republic', fixture('trade-republic/fixture-utente.csv'))
    expect(deposit).toMatchObject({
      bookedOn: '2026-10-01',
      occurredAt: '2026-10-01T10:15:00.000Z',
      amount: 20000,
      externalId: 'TEST-TR-001',
      sourceType: 'CUSTOMER_INBOUND',
      movement: 'cash',
      counterparty: 'Test User',
      hint: { type: 'transfer' },
    })
    expect(buy).toMatchObject({
      amount: -20000,
      externalId: 'TEST-TR-002',
      movement: 'trade',
      hint: { type: 'investment', nature: 'investment' },
      investment: {
        kind: 'buy',
        isin: 'IE00B4L5Y983',
        name: 'Core MSCI World USD (Acc)',
        assetClass: 'FUND',
        quantity: '2.000000',
        price: '100.000000',
        savingsPlan: true,
      },
    })
  })

  it('export completo: tutti i tipi con la semantica corretta', () => {
    const result = analyzeCsv(fixture('trade-republic/completo.csv'), 'trade_republic', CONTEXT)
    if (!result.ok) throw new Error(result.errors.join())
    const rows = result.analysis.outcomes.flatMap((o) => (o.kind === 'ok' ? [o.transaction] : []))
    const byId = Object.fromEntries(rows.map((r) => [r.externalId, r]))

    expect(byId['TEST-TR-101']).toMatchObject({ movement: 'cash', hint: { type: 'transfer' } }) // versamento
    expect(byId['TEST-TR-102']).toMatchObject({ movement: 'cash', hint: { type: 'transfer' } }) // ricarica carta
    expect(byId['TEST-TR-103']).toMatchObject({
      movement: 'trade',
      fee: 100,
      secondary: [{ part: 'fee', amount: -100 }],
      investment: { kind: 'buy', savingsPlan: false },
    })
    expect(byId['TEST-TR-104']).toMatchObject({ movement: 'trade', investment: { kind: 'buy', savingsPlan: true, isin: 'IE00B5BMR087' } })
    expect(byId['TEST-TR-105']).toMatchObject({
      movement: 'trade',
      amount: 15000,
      investment: { kind: 'sell' },
      secondary: [{ part: 'fee', amount: -100 }, { part: 'tax', amount: -500 }],
    })
    expect(byId['TEST-TR-106']).toMatchObject({
      movement: 'cash',
      amount: 340,
      originalAmount: 400,
      originalCurrency: 'USD',
      hint: { type: 'income', nature: 'investment', categoryPath: 'Interessi e dividendi' },
      investment: { kind: 'dividend' },
      secondary: [{ part: 'tax', amount: -60 }],
    })
    expect(byId['TEST-TR-107']).toMatchObject({ hint: { type: 'income', nature: 'investment' } }) // interessi
    expect(byId['TEST-TR-108']).toMatchObject({ hint: { type: 'expense', nature: 'investment' } }) // commissione
    expect(byId['TEST-TR-109']).toMatchObject({ hint: { type: 'expense', nature: 'investment' } }) // imposta
    expect(byId['TEST-TR-110']).toMatchObject({ amount: -10000, hint: { type: 'transfer' } }) // prelievo
    expect(byId['TEST-TR-111']).toMatchObject({ hint: null }) // tipo sconosciuto: nessuna invenzione
    // Solo datetime UTC (23:30Z dell'11/10) → 12/10 a Roma.
    expect(byId['TEST-TR-112']).toMatchObject({ bookedOn: '2026-10-12' })
  })

  it('un BUY con importo positivo o senza ISIN è invalido', () => {
    const header = new TextDecoder().decode(fixture('trade-republic/fixture-utente.csv')).split('\n')[0]
    const line = '"2026-10-02T14:30:00.000Z","2026-10-02","DEFAULT","TRADING","BUY","FUND","X","","1","1","-1.00","","","EUR","","","","x","T-1","","","",""'
    const result = analyzeCsv(bytes(`${header}\n${line}`), 'trade_republic', CONTEXT)
    if (!result.ok) throw new Error('atteso ok')
    expect(result.analysis.outcomes[0]).toMatchObject({ kind: 'invalid', errors: ['Operazione su titoli senza ISIN o quantità'] })
  })
})
