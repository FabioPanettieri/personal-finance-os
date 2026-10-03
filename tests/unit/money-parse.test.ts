import { describe, expect, it } from 'vitest'

import { cents } from '@/lib/money'
import { formatAmountInput, parseAmountInput } from '@/lib/money/parse'

describe('parseAmountInput (formato italiano)', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234,5', 123450],
    ['0,05', 5],
    ['-50', -5000],
    ['+12,00', 1200],
    ['€ 1.000.000,00', 100000000],
    ['  250  ', 25000],
    ['-0', 0],
    ['12.500', 1250000],
  ])('%j → %i centesimi', (input, expected) => {
    expect(parseAmountInput(input)).toEqual({ ok: true, value: expected })
  })

  it('rifiuta il punto come separatore decimale (ambiguo)', () => {
    expect(parseAmountInput('12.5')).toEqual({ ok: false, error: 'Usa la virgola per i decimali (es. 12,50)' })
  })

  it.each(['', 'abc', '1,234', '12,345', '1.23,45', '1..2', '--5', '12,5,0'])('rifiuta %j', (input) => {
    expect(parseAmountInput(input).ok).toBe(false)
  })

  it('non usa float: 0,1 + 0,2 resta esatto', () => {
    const a = parseAmountInput('0,10')
    const b = parseAmountInput('0,20')
    expect(a.ok && b.ok && a.value + b.value).toBe(30)
  })

  it('formatAmountInput è l’inverso per precompilare i form', () => {
    for (const value of [0, 5, 123456, -5000, 100000000]) {
      const text = formatAmountInput(cents(value))
      expect(parseAmountInput(text)).toEqual({ ok: true, value })
    }
    expect(formatAmountInput(cents(-5))).toBe('-0,05')
  })
})
