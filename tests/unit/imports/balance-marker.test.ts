import { describe, expect, it } from 'vitest'

import { analyzeCsv, reconcile } from '@/lib/imports/pipeline'

import { bytes, CONTEXT, fixture, preview } from './helpers'

describe('righe di saldo (Saldo iniziale / Saldo finale)', () => {
  it('non diventano mai transazioni e portano il saldo dichiarato', () => {
    const result = analyzeCsv(fixture('ing/formato-reale.csv'), 'ing', CONTEXT)
    if (!result.ok) throw new Error('analisi fallita')
    const markers = result.analysis.outcomes.filter((o) => o.kind === 'skipped')
    expect(markers).toHaveLength(2)
    expect(markers.map((m) => (m.kind === 'skipped' ? m.balance : null))).toEqual([
      { kind: 'opening', date: '2026-09-01', amount: 50000 },
      { kind: 'closing', date: '2026-10-03', amount: 90000 },
    ])
  })

  it('riconciliazione: saldo iniziale + movimenti = saldo finale', () => {
    const result = analyzeCsv(fixture('ing/formato-reale.csv'), 'ing', CONTEXT)
    if (!result.ok) throw new Error('analisi fallita')
    expect(result.analysis.reconciliation).toMatchObject({ movementsCents: 40000, expectedClosingCents: 90000, ok: true })
  })

  it('riconciliazione non riuscita segnalata sulla riga del saldo finale', async () => {
    const csv = 'DATA CONTABILE;DATA VALUTA;USCITE;ENTRATE;CAUSALE;DESCRIZIONE OPERAZIONE\r\n' +
      '01/09/2026;;;+100,00;;Saldo iniziale\r\n' +
      '02/09/2026;02/09/2026;-10,00;;Bonifico In Uscita;Pagamento\r\n' +
      '03/09/2026;;;+95,00;;Saldo finale\r\n'
    const result = analyzeCsv(bytes(csv), 'ing', CONTEXT)
    if (!result.ok) throw new Error('analisi fallita')
    expect(result.analysis.reconciliation).toMatchObject({ ok: false, expectedClosingCents: 9000 })
    const rows = await preview('ing', bytes(csv), { reconciliation: result.analysis.reconciliation })
    expect(rows.at(-1)!.messages.join()).toMatch(/Riconciliazione NON riuscita.*95,00/)
  })

  it('senza saldo iniziale o finale nessuna riconciliazione', () => {
    expect(reconcile([])).toBeNull()
  })

  it('una descrizione che inizia con "Saldo" ma ha una causale resta un movimento', () => {
    const csv = 'DATA CONTABILE;DATA VALUTA;USCITE;ENTRATE;CAUSALE;DESCRIZIONE OPERAZIONE\r\n02/09/2026;02/09/2026;-10,00;;Bonifico In Uscita;Saldo iniziale fattura 12\r\n'
    const result = analyzeCsv(bytes(csv), 'ing', CONTEXT)
    expect(result.ok && result.analysis.outcomes[0]!.kind).toBe('ok')
  })
})
