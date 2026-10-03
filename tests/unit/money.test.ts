import { describe, expect, it } from 'vitest'

import {
  MoneyError,
  addCents,
  cents,
  centsFromDb,
  formatMoney,
  negateCents,
  percentChange,
  sumCents,
} from '@/lib/money'

const nbsp = (s: string) => s.replace(/ | /g, ' ')

describe('cents', () => {
  it('accetta solo interi sicuri', () => {
    expect(cents(1050)).toBe(1050)
    expect(() => cents(10.5)).toThrow(MoneyError)
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError)
    expect(() => cents(Number.NaN)).toThrow(MoneyError)
  })

  it('converte il bigint di PostgreSQL serializzato come stringa', () => {
    expect(centsFromDb('210050')).toBe(210050)
    expect(centsFromDb(-65000)).toBe(-65000)
    expect(centsFromDb(12n)).toBe(12)
    expect(() => centsFromDb('9007199254740993')).toThrow(MoneyError)
  })
})

describe('aritmetica', () => {
  it('0,10 + 0,20 = 0,30 esatto (niente float)', () => {
    expect(addCents(cents(10), cents(20))).toBe(30)
  })

  it('somma molti importi senza errori di arrotondamento', () => {
    const values = Array.from({ length: 10_000 }, () => cents(1))
    expect(sumCents(values)).toBe(10_000)
    expect(sumCents([cents(210050), cents(-65000), cents(-50000), cents(50000)])).toBe(145050)
  })

  it('negazione senza -0', () => {
    expect(Object.is(negateCents(cents(0)), 0)).toBe(true)
    expect(negateCents(cents(500))).toBe(-500)
  })
})

describe('formatMoney', () => {
  it('formatta in it-IT', () => {
    expect(nbsp(formatMoney(cents(123456)))).toBe('1.234,56 €')
    expect(nbsp(formatMoney(cents(-1050)))).toBe('-10,50 €')
    expect(nbsp(formatMoney(cents(5)))).toBe('0,05 €')
    expect(nbsp(formatMoney(cents(520000)))).toBe('5.200,00 €')
  })

  it('mostra il segno su richiesta', () => {
    expect(nbsp(formatMoney(cents(50000), { signDisplay: 'always' }))).toBe('+500,00 €')
  })
})

describe('percentChange', () => {
  it('calcola la variazione rispetto al periodo precedente', () => {
    expect(percentChange(cents(110), cents(100))).toBeCloseTo(0.1)
    expect(percentChange(cents(90), cents(100))).toBeCloseTo(-0.1)
  })

  it('restituisce null se il riferimento è zero', () => {
    expect(percentChange(cents(100), cents(0))).toBeNull()
  })
})
