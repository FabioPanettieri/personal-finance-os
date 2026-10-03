import { describe, expect, it } from 'vitest'

import {
  accountKind,
  balanceSeries,
  movementsInBalanceWindow,
  summarizeFlows,
  totalsByCurrency,
  type AccountMovement,
  type TransactionType,
} from '@/lib/accounts'
import { toIsoDate } from '@/lib/dates'
import { cents, sumCents } from '@/lib/money'

const m = (bookedOn: string, amount: number, type: TransactionType): AccountMovement => ({
  bookedOn: toIsoDate(bookedOn),
  amount: cents(amount),
  type,
})

// Conto corrente sintetico (nessun dato reale).
const ING: AccountMovement[] = [
  m('2026-09-01', 210050, 'income'), // stipendio
  m('2026-09-03', -65000, 'expense'), // mutuo
  m('2026-09-05', -50000, 'transfer'), // giroconto verso Revolut
  m('2026-09-10', 2500, 'refund'), // rimborso
  m('2026-09-10', -1200, 'expense'),
  m('2026-09-15', -20000, 'investment'), // versamento PAC
  m('2026-09-20', 30000, 'transfer'), // rientro da Revolut
]

describe('summarizeFlows', () => {
  const flows = summarizeFlows(ING)

  it('separa entrate, uscite, trasferimenti e investimenti', () => {
    expect(flows.income).toBe(210050)
    expect(flows.expenses).toBe(66200)
    expect(flows.refunds).toBe(2500)
    expect(flows.netExpenses).toBe(63700)
    expect(flows.transfersIn).toBe(30000)
    expect(flows.transfersOut).toBe(50000)
    expect(flows.investedOut).toBe(20000)
    expect(flows.investedIn).toBe(0)
    expect(flows.movementCount).toBe(7)
    expect(flows.firstOn).toBe('2026-09-01')
    expect(flows.lastOn).toBe('2026-09-20')
  })

  it('i trasferimenti non sono entrate né spese', () => {
    const onlyTransfers = summarizeFlows([m('2026-09-01', -50000, 'transfer'), m('2026-09-02', 50000, 'transfer')])
    expect(onlyTransfers.income).toBe(0)
    expect(onlyTransfers.netExpenses).toBe(0)
  })

  it('riconciliazione: le componenti sommano alla variazione del saldo', () => {
    const reconstructed =
      flows.income + flows.refunds - flows.expenses + flows.transfersIn - flows.transfersOut + flows.investedIn - flows.investedOut
    expect(reconstructed).toBe(flows.netChange)
    expect(flows.netChange).toBe(sumCents(ING.map((x) => x.amount)))
  })

  it('conto senza movimenti', () => {
    expect(summarizeFlows([])).toMatchObject({ netChange: 0, movementCount: 0, firstOn: null, lastOn: null })
  })
})

describe('finestra del saldo (stessa regola della vista account_balances)', () => {
  it('esclude i movimenti precedenti alla data del saldo iniziale', () => {
    expect(movementsInBalanceWindow(ING, toIsoDate('2026-09-10')).map((x) => x.bookedOn)).toEqual([
      '2026-09-10',
      '2026-09-10',
      '2026-09-15',
      '2026-09-20',
    ])
    expect(movementsInBalanceWindow(ING, null)).toHaveLength(7)
  })
})

describe('balanceSeries', () => {
  it('saldo a fine giornata, un punto per giorno con movimenti', () => {
    const series = balanceSeries(ING, cents(100000), null)
    expect(series.map((p) => [p.date, p.balance])).toEqual([
      ['2026-09-01', 310050],
      ['2026-09-03', 245050],
      ['2026-09-05', 195050],
      ['2026-09-10', 196350],
      ['2026-09-15', 176350],
      ['2026-09-20', 206350],
    ])
  })

  it('l’ultimo punto coincide con saldo iniziale + movimenti', () => {
    const series = balanceSeries(ING, cents(100000), null)
    expect(series.at(-1)!.balance).toBe(100000 + sumCents(ING.map((x) => x.amount)))
  })

  it('parte dal saldo iniziale se datato prima del primo movimento', () => {
    const series = balanceSeries(ING, cents(5000), toIsoDate('2026-08-31'))
    expect(series[0]).toEqual({ date: '2026-08-31', balance: 5000 })
    expect(series).toHaveLength(7)
  })

  it('ignora i movimenti fuori finestra e ordina per data', () => {
    const shuffled = [...ING].reverse()
    const series = balanceSeries(shuffled, cents(0), toIsoDate('2026-09-15'))
    expect(series.map((p) => [p.date, p.balance])).toEqual([
      ['2026-09-15', -20000],
      ['2026-09-20', 10000],
    ])
  })

  it('nessun movimento e nessuna data: serie vuota (niente dati inventati)', () => {
    expect(balanceSeries([], cents(1000), null)).toEqual([])
    expect(balanceSeries([], cents(1000), toIsoDate('2026-09-01'))).toEqual([{ date: '2026-09-01', balance: 1000 }])
  })
})

describe('totalsByCurrency', () => {
  it('un trasferimento interno non aumenta il totale', () => {
    const before = totalsByCurrency([
      { currency: 'EUR', balance: cents(100000), kind: 'liquid' },
      { currency: 'EUR', balance: cents(0), kind: 'liquid' },
    ])
    // ING → Revolut 500 €: −500 su un conto, +500 sull'altro.
    const after = totalsByCurrency([
      { currency: 'EUR', balance: cents(50000), kind: 'liquid' },
      { currency: 'EUR', balance: cents(50000), kind: 'liquid' },
    ])
    expect(after[0]!.total).toBe(before[0]!.total)
  })

  it('un versamento verso il broker sposta valore da liquidità a investimento, il totale resta', () => {
    const totals = totalsByCurrency([
      { currency: 'EUR', balance: cents(80000), kind: 'liquid' },
      { currency: 'EUR', balance: cents(20000), kind: 'investment' },
    ])
    expect(totals[0]).toMatchObject({ total: 100000, liquid: 80000, investment: 20000, accountCount: 2 })
  })

  it('non somma mai valute diverse; EUR per prima', () => {
    const totals = totalsByCurrency([
      { currency: 'USD', balance: cents(1000), kind: 'liquid' },
      { currency: 'EUR', balance: cents(2000), kind: 'liquid' },
      { currency: 'CHF', balance: cents(3000), kind: 'other' },
    ])
    expect(totals.map((t) => [t.currency, t.total])).toEqual([
      ['EUR', 2000],
      ['CHF', 3000],
      ['USD', 1000],
    ])
  })
})

describe('accountKind', () => {
  it('classifica dai flag di account_types', () => {
    expect(accountKind({ is_liquid: true, is_investment: false })).toBe('liquid')
    expect(accountKind({ is_liquid: false, is_investment: true })).toBe('investment')
    expect(accountKind({ is_liquid: false, is_investment: false })).toBe('other')
  })
})
