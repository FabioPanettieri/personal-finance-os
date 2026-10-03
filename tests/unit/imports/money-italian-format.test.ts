import { describe, expect, it } from 'vitest'

import { parseAmount, parseDecimalString, positiveDecimal } from '@/lib/csv/values'
import { formatCentsPlain } from '@/lib/imports/format'

describe('importi in formato italiano, sempre in centesimi interi', () => {
  it.each([
    ['+1.672,00', 167200],
    ['-1.565,00', -156500],
    ['-829,83', -82983],
    ['+203,42', 20342],
    ['0,01', 1],
    ['-0,10', -10],
    ['1.234.567,89', 123456789],
    ['-2.50', -250],
    ['167.00', 16700],
  ])('%s → %i centesimi', (text, expected) => {
    const parsed = parseAmount(text, text.includes(',') ? ',' : '.')
    expect(parsed).toMatchObject({ ok: true, value: expected })
  })

  it('valori che in float darebbero errori di arrotondamento restano esatti', () => {
    // 0.1 + 0.2 in float = 0.30000000000000004; qui solo interi.
    const sum = [parseAmount('0,10'), parseAmount('0,20')].reduce((acc, r) => acc + (r.ok ? r.value : 0), 0)
    expect(sum).toBe(30)
    expect(parseAmount('1,005')).toMatchObject({ ok: true, value: 101 })
    expect(parseAmount('1,0049')).toMatchObject({ ok: true, value: 100 })
  })

  it('formattazione italiana senza float', () => {
    expect(formatCentsPlain(-156500)).toBe('-1.565,00')
    expect(formatCentsPlain(5)).toBe('0,05')
    expect(formatCentsPlain(123456789)).toBe('1.234.567,89')
  })

  it('quantità e prezzi restano stringhe decimali (numeric), mai Number', () => {
    expect(parseDecimalString('0,123456789')).toEqual({ ok: true, value: '0.123456789' })
    expect(positiveDecimal('0.000001')).toBe('0.000001')
    expect(positiveDecimal('12345678901234567890.123456')).toBe('12345678901234567890.123456')
    expect(positiveDecimal('0.000')).toBeNull()
    expect(positiveDecimal('-1')).toBeNull()
    expect(positiveDecimal(null)).toBeNull()
  })
})
