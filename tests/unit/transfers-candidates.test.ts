import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { parseTransactionFilters, transactionsHref } from '@/lib/transactions/filters'
import { candidateWindow, MANUAL_WINDOW_DAYS, rankCandidates, type CandidateRow } from '@/lib/transfers/candidates'

const row = (id: string, accountId: string, day: string, amount: number, type = 'transfer', extra: Partial<CandidateRow> = {}): CandidateRow => ({
  id,
  accountId,
  bookedOn: toIsoDate(day),
  amount,
  currency: 'EUR',
  type,
  transferGroupId: null,
  ...extra,
})

describe('altre metà di un trasferimento', () => {
  const tx = row('tx', 'ing', '2026-09-15', -50000)

  it('solo importo opposto, stessa valuta, altro conto, non collegate, entro ±7 giorni', () => {
    const result = rankCandidates(tx, [
      row('ok', 'rev', '2026-09-16', 50000),
      row('stesso-conto', 'ing', '2026-09-15', 50000),
      row('stesso-segno', 'rev', '2026-09-15', -50000),
      row('altro-importo', 'rev', '2026-09-15', 49999),
      row('collegata', 'rev', '2026-09-15', 50000, 'transfer', { transferGroupId: 'g' }),
      row('usd', 'rev', '2026-09-15', 50000, 'transfer', { currency: 'USD' }),
      row('troppo-tardi', 'rev', '2026-09-23', 50000),
      row('al-limite', 'rev', '2026-09-22', 50000),
      row('tx', 'rev', '2026-09-15', 50000),
    ])
    expect(result.map((r) => r.id)).toEqual(['ok', 'al-limite'])
  })

  it('prima i trasferimenti già riconosciuti, poi per vicinanza di data', () => {
    const result = rankCandidates(tx, [
      row('entrata-stesso-giorno', 'rev', '2026-09-15', 50000, 'income'),
      row('trasferimento-3-giorni', 'tr', '2026-09-18', 50000),
      row('trasferimento-1-giorno', 'rev', '2026-09-14', 50000),
    ])
    expect(result.map((r) => r.id)).toEqual(['trasferimento-1-giorno', 'trasferimento-3-giorni', 'entrata-stesso-giorno'])
  })

  it('finestra di ricerca', () => {
    expect(MANUAL_WINDOW_DAYS).toBe(7)
    expect(candidateWindow(toIsoDate('2026-03-01'))).toEqual({ from: '2026-02-22', to: '2026-03-08' })
  })
})

describe('filtro "da abbinare"', () => {
  it('status=unmatched nell\'URL, esclusivo con "da sistemare"', () => {
    const f = parseTransactionFilters({ status: 'unmatched' })
    expect(f.unmatched).toBe(true)
    expect(f.review).toBe(false)
    expect(transactionsHref({ unmatched: true })).toBe('/transactions?status=unmatched')
    expect(transactionsHref({ review: true, unmatched: true })).toBe('/transactions?status=review')
    expect(parseTransactionFilters({}).unmatched).toBe(false)
  })
})

describe('ordinamento', () => {
  it('sort nell\'URL, "più recenti" di default e non scritto', () => {
    expect(parseTransactionFilters({}).sort).toBe('date')
    expect(parseTransactionFilters({ sort: 'amount-asc' }).sort).toBe('amount-asc')
    expect(parseTransactionFilters({ sort: 'boh' }).sort).toBe('date')
    expect(transactionsHref({ sort: 'amount-desc' })).toBe('/transactions?sort=amount-desc')
    expect(transactionsHref({ sort: 'date' })).toBe('/transactions')
  })
})
