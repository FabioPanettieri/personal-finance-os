import { describe, expect, it } from 'vitest'

import { parseTransactionFilters, transactionsHref, typesFor } from '@/lib/transactions/filters'

const UUID = '11111111-2222-4333-8444-555555555555'

describe('filtri della lista movimenti (URL)', () => {
  it('legge e riscrive gli stessi filtri', () => {
    const f = parseTransactionFilters({ from: '2026-09-01', to: '2026-09-30', category: UUID, type: 'spending', status: 'review', q: 'etsy', page: '2' })
    expect(f).toMatchObject({ from: '2026-09-01', to: '2026-09-30', categoryId: UUID, type: 'spending', review: true, query: 'etsy', page: 2 })
    expect(transactionsHref(f)).toBe(`/transactions?from=2026-09-01&to=2026-09-30&category=${UUID}&type=spending&status=review&q=etsy&page=2`)
  })

  it('ignora valori non validi, inverte date al contrario', () => {
    const f = parseTransactionFilters({ from: '2026-09-30', to: '2026-09-01', category: 'drop table', type: 'x', page: '-3', account: 'none' })
    expect(f).toMatchObject({ from: '2026-09-01', to: '2026-09-30', categoryId: null, type: null, page: 1, accountId: null })
    expect(parseTransactionFilters({ category: 'none', source: 'none' })).toMatchObject({ categoryId: 'none', incomeSourceId: 'none' })
  })

  it('"spending" = spese + rimborsi (come gli aggregati)', () => {
    expect(typesFor('spending')).toEqual(['expense', 'refund'])
    expect(typesFor('transfer')).toEqual(['transfer'])
    expect(transactionsHref()).toBe('/transactions')
  })
})

describe('IBAN della controparte nel dettaglio', () => {
  it('mostrato mascherato', async () => {
    const { maskIban } = await import('@/server/repositories/transactions')
    expect(maskIban('IT00R0000000000000000000003')).toBe('IT00 •••• 0003')
    expect(maskIban('IT00 R000 0000')).toBe('IT00 •••• 0000')
    expect(maskIban('IT00')).toBe('••••')
  })
})
