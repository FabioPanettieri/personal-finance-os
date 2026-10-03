import { describe, expect, it } from 'vitest'

import { decodeBytes, looksBinary } from '@/lib/csv/decode'
import { detectDelimiter, parseCsv } from '@/lib/csv/parse'
import { normalizeDescription, parseAmount, parseDate, parseDateTime } from '@/lib/csv/values'

describe('decodifica', () => {
  it('UTF-8 con e senza BOM', () => {
    const text = 'Data,Descrizione\n01/10/2026,Caffè'
    expect(decodeBytes(new TextEncoder().encode(text))).toMatchObject({ text, encoding: 'utf-8', hadBom: false })
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])
    expect(decodeBytes(withBom)).toMatchObject({ text, encoding: 'utf-8', hadBom: true })
  })

  it('UTF-16 LE con BOM', () => {
    const text = 'Data;Importo\n01/10/2026;1,00'
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    expect(decodeBytes(new Uint8Array(utf16))).toMatchObject({ text, encoding: 'utf-16le' })
  })

  it('Windows-1252 quando l’UTF-8 non è valido (accenti di export Windows)', () => {
    const latin = Buffer.from('Descrizione\nCaffè Società', 'latin1')
    expect(decodeBytes(new Uint8Array(latin))).toMatchObject({ text: 'Descrizione\nCaffè Società', encoding: 'windows-1252' })
  })

  it('riconosce file binari', () => {
    expect(looksBinary(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe(true)
    expect(looksBinary(new TextEncoder().encode('a,b\n1,2'))).toBe(false)
  })
})

describe('delimitatore e parsing', () => {
  it.each([
    ['a,b,c\n1,2,3', ','],
    ['a;b;c\n1;2;3', ';'],
    ['a\tb\tc\n1\t2\t3', '\t'],
    ['"a;x",b,c\n"1;y",2,3', ','],
  ])('%j → %j', (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected)
  })

  it('righe come record intestazione → valore, celle ripulite', () => {
    const parsed = parseCsv('Data;Descrizione;Importo\n01/10/2026; Bar\u0007 ;-1,50\n\n')
    expect(parsed.headers).toEqual(['Data', 'Descrizione', 'Importo'])
    expect(parsed.rows).toEqual([{ Data: '01/10/2026', Descrizione: 'Bar', Importo: '-1,50' }])
  })

  it('rifiuta intestazioni duplicate e virgolette non chiuse', () => {
    expect(() => parseCsv('Data,Data\n1,2')).toThrow(/duplicata/)
    expect(() => parseCsv('a,b\n"1,2')).toThrow(/virgolette/)
  })
})

describe('parseAmount (centesimi interi)', () => {
  it.each([
    ['1650.00', ',', 165000],
    ['-300.00', ',', -30000],
    ['1.650,00', ',', 165000],
    ['1,650.00', ',', 165000],
    ['-62,35', ',', -6235],
    ['1.650', ',', 165000],
    ['1,650', '.', 165000],
    ['1,65', '.', 165],
    ['(12,00)', ',', -1200],
    ['300,00-', ',', -30000],
    ['€ 5', ',', 500],
    ['200.000000', '.', 20000],
    ['+0.05', '.', 5],
    ['1.234.567,89', ',', 123456789],
  ] as const)('%j (%s) → %i', (raw, preferred, expected) => {
    expect(parseAmount(raw, preferred)).toEqual({ ok: true, value: expected })
  })

  it('arrotonda oltre il centesimo segnalandolo', () => {
    expect(parseAmount('10.005', '.')).toEqual({ ok: true, value: 1001, warning: 'Importo arrotondato al centesimo: "10.005"' })
  })

  it.each(['', 'abc', '1,2,3,4x', '--5', '12a'])('rifiuta %j', (raw) => {
    expect(parseAmount(raw).ok).toBe(false)
  })
})

describe('date', () => {
  it('formati di calendario senza fuso', () => {
    expect(parseDate('01/10/2026', ['DD/MM/YYYY'])).toEqual({ ok: true, value: '2026-10-01' })
    expect(parseDate('2026-10-01', ['DD/MM/YYYY', 'YYYY-MM-DD'])).toEqual({ ok: true, value: '2026-10-01' })
    expect(parseDate('31/02/2026', ['DD/MM/YYYY'])).toEqual({ ok: false, error: 'Data inesistente: "31/02/2026"' })
    expect(parseDate('2026/10/01', ['DD/MM/YYYY']).ok).toBe(false)
  })

  it('istante UTC → giorno di Roma; ora locale senza fuso → data così com’è', () => {
    expect(parseDateTime('2026-10-11T23:30:00.000Z')).toEqual({
      ok: true,
      value: { date: '2026-10-12', instant: '2026-10-11T23:30:00.000Z' },
    })
    expect(parseDateTime('2026-10-02 23:59:00')).toEqual({ ok: true, value: { date: '2026-10-02', instant: null } })
    expect(parseDateTime('2026-10-02')).toEqual({ ok: true, value: { date: '2026-10-02', instant: null } })
  })
})

describe('normalizeDescription', () => {
  it('minuscole, niente accenti né punteggiatura', () => {
    expect(normalizeDescription('  PAGAMENTO POS – Caffè "Società"  ')).toBe('pagamento pos caffe societa')
  })
})
