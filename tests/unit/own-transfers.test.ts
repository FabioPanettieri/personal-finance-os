import { monthlyAccountFlows } from '@/lib/accounts'
import { normalizeDescription } from '@/lib/csv/values'
import { toIsoDate } from '@/lib/dates'
import { cents } from '@/lib/money'
import { maskIban, nameKey, ownNamePattern, personWords, recurringIbans } from '@/lib/transfers/own-transfers'

// @ts-expect-error -- modulo .mjs senza tipi
import { limitSql, ruleSql } from '../../scripts/rules/apply-decisions.mjs'

describe('giroconti: nome dell’intestatario', () => {
  it('riconosce solo nomi di persona (2–4 parole)', () => {
    expect(personWords('Mario Rossi')).toEqual(['mario', 'rossi'])
    expect(personWords('Estratto conto carta di credito al 20260910')).toBeNull()
    expect(personWords('Amazon')).toBeNull()
    expect(nameKey('ROSSI MARIO')).toBe(nameKey('Mario Rossi'))
  })

  it('il nome vale in qualunque ordine e con "Paypal*", ma non un omonimo parziale', () => {
    const re = new RegExp(ownNamePattern(['Mario Rossi', 'ROSSI MARIO'])!, 'i')
    for (const ok of ['Mario Rossi', 'ROSSI MARIO', 'Paypal*rossi Mario']) expect(re.test(normalizeDescription(ok)), ok).toBe(true)
    for (const no of ['Mario Bianchi', 'Mario Rossi Srl', 'Pagamento Mario Rossi']) expect(re.test(normalizeDescription(no)), no).toBe(false)
    expect(ownNamePattern(['Amazon', ''])).toBeNull()
  })
})

describe('giroconti: IBAN ricorrenti', () => {
  const row = (iban: string | null, type = 'expense', manual = false) => ({ iban, type, manual })
  it('almeno 3 bonifici, esclusi i conti già noti e quelli corretti a mano', () => {
    const rows = [row('A'), row('A'), row('A'), row('B'), row('B'), row('C'), row('C'), row('C', 'expense', true), row('C'), row('D'), row('D'), row('D'), row(null)]
    expect(recurringIbans(rows, new Set(['D']))).toEqual(['A'])
    expect(recurringIbans([row('E'), row('E'), row('E', 'transfer', true)], new Set())).toEqual(['E'])
  })
  it('nei nomi delle regole solo le ultime 4 cifre', () => {
    expect(maskIban('IT60X0542811101000000123456')).toBe('…3456')
  })
})

describe('andamento mensile di un conto', () => {
  it('ultimi 6 mesi, spese al netto dei rimborsi, trasferimenti in valore assoluto', () => {
    const months = monthlyAccountFlows(
      [
        { bookedOn: toIsoDate('2026-10-02'), amount: cents(100000), type: 'income' },
        { bookedOn: toIsoDate('2026-10-03'), amount: cents(-3000), type: 'expense' },
        { bookedOn: toIsoDate('2026-10-04'), amount: cents(1000), type: 'refund' },
        { bookedOn: toIsoDate('2026-09-04'), amount: cents(-5000), type: 'transfer' },
        { bookedOn: toIsoDate('2025-01-04'), amount: cents(-5000), type: 'expense' },
      ],
      toIsoDate('2026-10-09'),
    )
    expect(months.map((m) => m.month)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
    expect(months.at(-1)).toEqual({ month: '2026-10-01', income: 100000, spending: 2000, transfers: 0, count: 3 })
    expect(months.at(-2)).toMatchObject({ transfers: 5000, count: 1 })
  })
})

describe('script delle decisioni', () => {
  it('traduce le decisioni in regole con il testo protetto', () => {
    const sql: string = ruleSql({ testo: "L'Osteria", tipo: 'spesa', categoria: 'Alimentazione > Ristorante' }, 0)
    expect(sql).toContain("'l''osteria'")
    expect(sql).toContain("'expense', 'personal'")
    expect(() => ruleSql({ testo: 'ab', tipo: 'spesa' }, 0)).toThrow(/almeno 3/)
    expect(() => ruleSql({ testo: 'abc', tipo: 'boh' }, 0)).toThrow(/tipo/)
    expect(limitSql({ conto: 'Carta di credito', importo: 2000 }, 0)).toContain('credit_limit_cents = 200000')
  })
})
