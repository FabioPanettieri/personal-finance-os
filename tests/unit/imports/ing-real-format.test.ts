import { describe, expect, it } from 'vitest'

import { ingCounterparty } from '@/lib/imports/importers/ing'
import { analyzeCsv, validateFile } from '@/lib/imports/pipeline'

import { CONTEXT, fixture, normalized } from './helpers'

const FILE = 'ing/formato-reale.csv'

describe('ING — export reale (anonimizzato)', () => {
  it('la fixture conserva CRLF, `;` e il riempimento NUL fino a 4096 byte', () => {
    const file = fixture(FILE)
    expect(file.length).toBe(4096)
    expect(file.at(-1)).toBe(0)
    expect(new TextDecoder().decode(file).split('\r\n')[0]).toBe('DATA CONTABILE;DATA VALUTA;USCITE;ENTRATE;CAUSALE;DESCRIZIONE OPERAZIONE')
  })

  it('il file non è rifiutato come binario e i NUL non producono righe spurie', () => {
    const file = fixture(FILE)
    expect(validateFile({ name: 'estratto.csv', size: file.length, type: 'text/csv', bytes: file })).toEqual([])
    const result = analyzeCsv(file, 'ing', CONTEXT)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.analysis.delimiter).toBe(';')
    expect(result.analysis.outcomes).toHaveLength(14)
    expect(result.analysis.outcomes.filter((o) => o.kind === 'invalid')).toHaveLength(0)
    expect(result.analysis.outcomes.filter((o) => o.kind === 'ok')).toHaveLength(12)
  })

  it('entrate/uscite in formato italiano con segno esplicito', () => {
    const rows = normalized('ing', fixture(FILE))
    expect(rows.map((t) => t.amount)).toEqual([100000, -5000, -5000, -12000, -30000, 20000, -40000, 150000, -120000, -8000, -5000, -5000])
  })

  it('CAUSALE come tipo della banca, controparte e IBAN dalla descrizione', () => {
    const rows = normalized('ing', fixture(FILE))
    expect([...new Set(rows.map((t) => t.sourceType))]).toEqual(['Giroconto', 'Bonifico In Uscita', 'Addebito Carta Di Credito', 'Accredito Stipendio/Pensione'])
    expect(rows[1]).toMatchObject({ counterparty: 'Mario Rossi', counterpartyIban: 'IT00R0000000000000000000003' })
    expect(rows[0]).toMatchObject({ counterparty: 'MARIO ROSSI', counterpartyIban: 'IT00A0000000000000000000002' })
    expect(rows[7]).toMatchObject({ counterparty: 'AZIENDA ESEMPIO SRL', counterpartyIban: 'IT00C0000000000000000000005' })
    expect(rows[6]).toMatchObject({ counterparty: null, counterpartyIban: null })
  })

  it('estrazione robusta su testo senza struttura', () => {
    expect(ingCounterparty('Pagamento POS Bar Centrale')).toEqual({ name: null, iban: null })
  })
})
