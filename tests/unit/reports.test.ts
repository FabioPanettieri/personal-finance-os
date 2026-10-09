import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import { balanceAt, yearEndHistory } from '@/lib/reports/history'
import { buildInsights, type InsightInput } from '@/lib/reports/insights'
import { parseAnchor, resolveReportPeriod, shiftAnchor } from '@/lib/reports/periods'

const d = toIsoDate
const TODAY = d('2026-10-09')

describe('periodi dei report', () => {
  it('settimana da lunedì a domenica, con la precedente', () => {
    const p = resolveReportPeriod({ kind: 'week', at: '2026-10-07' }, TODAY)
    expect([p.from, p.to]).toEqual(['2026-10-05', '2026-10-11'])
    expect([p.previous.from, p.previous.to]).toEqual(['2026-09-28', '2026-10-04'])
    expect(p.label).toBe('Settimana 5–11 ottobre 2026')
    expect(p.ongoing).toBe(true)
  })

  it('mese con precedente e stesso mese dell’anno prima', () => {
    const p = resolveReportPeriod({ kind: 'month', at: '2026-03' }, TODAY)
    expect([p.from, p.to, p.label]).toEqual(['2026-03-01', '2026-03-31', 'Marzo 2026'])
    expect(p.previous.label).toBe('Febbraio 2026')
    expect(p.lastYear?.label).toBe('Marzo 2025')
    expect(p.ongoing).toBe(false)
  })

  it('anno; default mese corrente; futuro riportato a oggi', () => {
    const y = resolveReportPeriod({ kind: 'year', at: '2025' }, TODAY)
    expect([y.from, y.to, y.previous.label]).toEqual(['2025-01-01', '2025-12-31', '2024'])
    expect(resolveReportPeriod({}, TODAY).label).toBe('Ottobre 2026')
    expect(resolveReportPeriod({ kind: 'month', at: '2030-01' }, TODAY).label).toBe('Ottobre 2026')
    expect(parseAnchor('boh')).toBeNull()
  })

  it('frecce: niente periodo successivo nel futuro', () => {
    const p = resolveReportPeriod({ kind: 'month' }, TODAY)
    expect(shiftAnchor(p, -1, TODAY)).toBe('2026-09')
    expect(shiftAnchor(p, 1, TODAY)).toBeNull()
    expect(shiftAnchor(resolveReportPeriod({ kind: 'year', at: '2025' }, TODAY), 1, TODAY)).toBe('2026')
  })
})

describe('storico del patrimonio', () => {
  const history = [
    { date: d('2025-03-01'), balance: 100000 },
    { date: d('2025-12-20'), balance: 150000 },
    { date: d('2026-06-01'), balance: 180000 },
  ] as never
  it('valore a una data', () => {
    expect(balanceAt(history, d('2025-01-01'))).toBeNull()
    expect(balanceAt(history, d('2025-12-31'))).toBe(150000)
  })
  it('fine anno e variazione', () => {
    expect(yearEndHistory(history, TODAY)).toEqual([
      { year: 2025, value: 150000, change: null, ongoing: false },
      { year: 2026, value: 180000, change: 30000, ongoing: true },
    ])
  })
})

describe('osservazioni: solo dai dati', () => {
  const base: InsightInput = {
    currency: 'EUR',
    income: 200000,
    expenses: 150000,
    count: 20,
    previous: { label: 'Agosto 2026', income: 200000, expenses: 100000, count: 18 },
    categories: [
      { label: 'Casa', amount: 90000 },
      { label: 'Alimentazione', amount: 60000 },
    ],
    previousCategories: [
      { label: 'Casa', amount: 50000 },
      { label: 'Alimentazione', amount: 50000 },
    ],
    biggestExpense: { description: 'Rata mutuo', amount: -65000, bookedOn: d('2026-09-28') },
    netWorth: { start: 1000000, end: 1050000 },
    toReview: 0,
    ongoing: false,
  }

  it('ogni osservazione riporta i numeri da cui nasce', () => {
    const texts = Object.fromEntries(buildInsights(base).map((i) => [i.key, i.text.replace(/[\u00a0\u202f]/g, ' ')]))
    expect(texts.saved).toBe('Hai messo da parte 500,00 €: il 25,0% delle entrate.')
    expect(texts['expenses-change']).toBe('Uscite in aumento del 50,0% rispetto a Agosto 2026: 1.500,00 € contro 1.000,00 €.')
    expect(texts['income-change']).toBeUndefined() // stesse entrate: nessuna frase
    expect(texts['category-up']).toBe('Casa è la voce cresciuta di più: +400,00 € rispetto a Agosto 2026.')
    expect(texts['top-category']).toBe('La voce più pesante è Casa: 900,00 €, il 60,0% delle uscite.')
    expect(texts.biggest).toBe('Spesa più grande: Rata mutuo il 28 set 2026 (650,00 €).')
    expect(texts['net-worth']).toBe('Il patrimonio è passato da 10.000,00 € a 10.500,00 € (+500,00 €).')
  })

  it('periodo vuoto: una sola frase, nessun numero inventato', () => {
    expect(buildInsights({ ...base, count: 0, income: 0, expenses: 0, categories: [], biggestExpense: null })).toEqual([
      { key: 'empty', tone: 'neutral', text: 'Nessun movimento in questo periodo.' },
    ])
  })

  it('nessun confronto con un periodo precedente vuoto o senza storia', () => {
    const keys = buildInsights({ ...base, previous: { label: 'Agosto 2026', income: 0, expenses: 0, count: 0 }, netWorth: { start: null, end: 1050000 } }).map((i) => i.key)
    expect(keys).not.toContain('expenses-change')
    expect(keys).not.toContain('category-up')
    expect(keys).not.toContain('net-worth')
  })

  it('periodo in corso: niente "in calo" su numeri parziali; avviso da sistemare', () => {
    const keys = buildInsights({ ...base, ongoing: true, expenses: 20000, toReview: 3 }).map((i) => i.key)
    expect(keys).not.toContain('expenses-change')
    expect(keys[0]).toBe('review')
  })
})
