import { describe, expect, it } from 'vitest'

import { detectSource } from '@/lib/imports/importers'
import { analyzeCsv } from '@/lib/imports/pipeline'

import { bytes, CONTEXT, fixture, normalized } from './helpers'

const FILE = 'revolut/formato-reale.csv'
const HEADER = 'Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo'

describe('Revolut — export italiano reale (anonimizzato)', () => {
  it('riconosce il formato con punteggio alto, anche se scelto come ING viene bloccato', () => {
    const { best, scores } = detectSource(HEADER.split(','))
    expect(best).toBe('revolut')
    expect(scores.revolut).toBeGreaterThanOrEqual(0.9)
    const wrong = analyzeCsv(fixture(FILE), 'ing', CONTEXT)
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.errors.join()).toMatch(/Revolut/)
  })

  it('Prodotto "Attuale" e stato COMPLETATO: tutte le righe importabili', () => {
    const result = analyzeCsv(fixture(FILE), 'revolut', CONTEXT)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.analysis.outcomes.every((o) => o.kind === 'ok')).toBe(true)
    expect(result.analysis.outcomes).toHaveLength(22)
  })

  it('data della transazione = data di completamento; la data di inizio resta nel dato grezzo', () => {
    const esselunga = normalized('revolut', fixture(FILE)).find((t) => t.description === 'Esselunga')!
    expect(esselunga.bookedOn).toBe('2026-09-02')
    expect(esselunga.raw['Data di inizio']).toBe('2026-09-01 19:30:00')
  })

  it('tipi italiani: pagamento con carta = spesa; Ricarica mai trasferimento automatico', () => {
    const rows = normalized('revolut', fixture(FILE))
    const card = rows.find((t) => t.description === 'Packlink')!
    expect(card).toMatchObject({ sourceType: 'Pagamento con carta', hint: { type: 'expense' } })
    for (const topup of rows.filter((t) => t.sourceType === 'Ricarica')) {
      expect(topup.hint).toMatchObject({ type: null, confidence: 0 })
    }
  })

  it('controparte estratta dalla descrizione', () => {
    const rows = normalized('revolut', fixture(FILE))
    expect(rows.find((t) => t.description === 'Pagamento da ETSY PAYMENTS')!.counterparty).toBe('ETSY PAYMENTS')
    expect(rows.find((t) => t.description === 'A favore di Luca Bianchi')!.counterparty).toBe('Luca Bianchi')
  })

  it('stati italiani di storno/sospeso esclusi, stato sconosciuto segnalato', () => {
    const csv = (state: string) => bytes(`${HEADER}\nPagamento con carta,Attuale,2026-09-01 10:00:00,2026-09-01 10:00:00,Bar,-2.00,0.00,EUR,${state},10.00`)
    for (const state of ['STORNATO', 'RIFIUTATO', 'IN SOSPESO', 'REVERTED']) {
      const result = analyzeCsv(csv(state), 'revolut', CONTEXT)
      expect(result.ok && result.analysis.outcomes[0]!.kind).toBe('skipped')
    }
    const unknown = analyzeCsv(csv('BOH'), 'revolut', CONTEXT)
    expect(unknown.ok && unknown.analysis.outcomes[0]!.kind === 'ok' && unknown.analysis.outcomes[0]!.transaction.warnings.join()).toMatch(/non riconosciuto/)
  })

  it('prodotto diverso dal conto corrente escluso', () => {
    const csv = bytes(`${HEADER}\nRicarica,Risparmi,2026-09-01 10:00:00,2026-09-01 10:00:00,Vault,5.00,0.00,EUR,COMPLETATO,10.00`)
    const result = analyzeCsv(csv, 'revolut', CONTEXT)
    expect(result.ok && result.analysis.outcomes[0]!.kind).toBe('skipped')
  })
})
