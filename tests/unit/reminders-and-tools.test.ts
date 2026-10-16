import { initialBalanceFor } from '@/lib/accounts'
import { toIsoDate } from '@/lib/dates'
import { importReminders } from '@/lib/imports/reminder'
import { endOfDayBalance } from '@/lib/imports/reported-balance'
import { cents } from '@/lib/money'

// @ts-expect-error -- moduli .mjs senza tipi
import { accountSql } from '../../scripts/rules/apply-decisions.mjs'
// @ts-expect-error -- moduli .mjs senza tipi
import { groupKey, mask, report } from '../../scripts/rules/export-pending.mjs'

describe('promemoria settimanale degli estratti', () => {
  const today = toIsoDate('2026-10-15')
  const acc = (id: string, lastImportOn: string | null, lastMovementOn: string | null) => ({
    id,
    name: id,
    institution: null,
    lastImportOn: lastImportOn ? toIsoDate(lastImportOn) : null,
    lastMovementOn: lastMovementOn ? toIsoDate(lastMovementOn) : null,
  })

  it('ricorda i conti senza import da 7 giorni o mai importati, dal giorno dopo l’ultimo movimento', () => {
    const r = importReminders([acc('ing', '2026-10-01', '2026-09-30'), acc('rev', '2026-10-10', '2026-10-09'), acc('tr', null, null)], today)
    expect(r.map((x) => x.id)).toEqual(['ing', 'tr'])
    expect(r[0]).toMatchObject({ daysSinceImport: 14, suggestedFrom: '2026-10-01', suggestedTo: '2026-10-15' })
    expect(r[1]).toMatchObject({ daysSinceImport: null, suggestedFrom: null })
  })

  it('esattamente 7 giorni: si ricorda; 6: no', () => {
    expect(importReminders([acc('a', '2026-10-08', null)], today)).toHaveLength(1)
    expect(importReminders([acc('a', '2026-10-09', null)], today)).toHaveLength(0)
  })
})

describe('saldo reale', () => {
  it('il saldo iniziale fa tornare il saldo calcolato uguale a quello della banca', () => {
    // Saldo calcolato 1.565 € con iniziale 0: per avere 12.345,67 € l'iniziale diventa 10.780,67 €.
    expect(initialBalanceFor(cents(1234567), cents(156500), cents(0))).toBe(1078067)
    expect(initialBalanceFor(cents(1000), cents(1500), cents(500))).toBe(0)
  })

  it('script: IBAN validato e normalizzato, conto obbligatorio', () => {
    const sql: string = accountSql({ conto: 'ING Conto Risparmio', iban: 'it60 x054 2811 1010 0000 0123 456', saldo: 12345.67 }, 0)
    expect(sql).toContain("'IT60X0542811101000000123456'")
    expect(sql).toContain('1234567 - coalesce')
    const dated: string = accountSql({ conto: 'Deposito', saldo: 100, data: '2026-10-15' }, 0)
    expect(dated).toContain("date '2026-10-15' + 1")
    expect(() => accountSql({ conto: 'X', data: '15/10/2026', saldo: 1 }, 0)).toThrow(/AAAA-MM-GG/)
    expect(() => accountSql({ conto: 'X', iban: 'non-iban' }, 0)).toThrow(/IBAN/)
    expect(() => accountSql({ iban: 'IT60X0542811101000000123456' }, 0)).toThrow(/conto/)
  })
})

describe('elenco da sistemare', () => {
  const row = (descrizione: string, importo: number, controparte = '') => ({ origine: 'import', conto: 'Revolut', data: '2026-10-01', importo, controparte, descrizione })

  it('maschera IBAN e numeri lunghi', () => {
    expect(mask('Bonifico N. 0000513148 IBAN IT60X0542811101000000123456 ok')).toBe('Bonifico N. … IBAN IBAN…3456 ok')
  })

  it('raggruppa per conto, verso e controparte; i più numerosi prima', () => {
    expect(groupKey(row('Pagamento da MANGOPAY', 900, 'MANGOPAY'))).toBe('import | Revolut | entrate | mangopay')
    const text: string = report([row('Bar Centrale 1', -150), row('Bar Centrale 2', -250), row('Amazon', -999)])
    expect(text).toContain('3 movimenti, 2 gruppi')
    expect(text.split('\n')[2]).toMatch(/^1\. import \| Revolut \| uscite \| bar centrale — 2 mov\./)
  })
})

describe('saldo dichiarato dalla banca', () => {
  const r = (bookedOn: string, amount: number, reportedBalance: number | null) => ({ bookedOn: toIsoDate(bookedOn), amount, reportedBalance })

  it('prende il saldo dell’ultima riga dell’ultimo giorno, in qualunque ordine siano le righe', () => {
    const rows = [r('2026-10-01', -100, 900), r('2026-10-02', -50, 850), r('2026-10-02', 200, 1050), r('2026-10-02', -30, 1020)]
    expect(endOfDayBalance(rows)).toEqual({ date: '2026-10-02', balance: 1020 })
    expect(endOfDayBalance([...rows].reverse())).toEqual({ date: '2026-10-02', balance: 1020 })
  })

  it('senza saldi o con un caso ambiguo non tocca nulla', () => {
    expect(endOfDayBalance([r('2026-10-01', -100, null)])).toBeNull()
    expect(endOfDayBalance([r('2026-10-02', 10, 100), r('2026-10-02', -10, 90), r('2026-10-02', 10, 100)])).toBeNull()
  })
})
