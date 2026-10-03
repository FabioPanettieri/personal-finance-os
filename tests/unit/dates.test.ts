import { describe, expect, it } from 'vitest'

import {
  addDays,
  daysInMonth,
  endOfMonth,
  formatIsoDate,
  isIsoDate,
  isoDateInTimeZone,
  startOfMonth,
  toIsoDate,
  today,
} from '@/lib/dates'

describe('isIsoDate', () => {
  it.each([
    ['2026-10-03', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2100-02-29', false],
    ['2000-02-29', true],
    ['2026-04-31', false],
    ['2026-13-01', false],
    ['03/10/2026', false],
    ['2026-10-3', false],
  ])('%s → %s', (value, expected) => {
    expect(isIsoDate(value)).toBe(expected)
  })
})

describe('giorno di calendario in un fuso esplicito', () => {
  it('23:30 UTC del 31/12 è già 1° gennaio a Roma', () => {
    const instant = new Date('2026-12-31T23:30:00Z')
    expect(isoDateInTimeZone(instant, 'Europe/Rome')).toBe('2027-01-01')
    expect(isoDateInTimeZone(instant, 'UTC')).toBe('2026-12-31')
  })

  it('today() usa Europe/Rome indipendentemente dal fuso del processo', () => {
    // Il processo dei test gira in America/Los_Angeles (vitest.config.ts).
    expect(today('Europe/Rome', new Date('2026-10-03T22:30:00Z'))).toBe('2026-10-04')
  })
})

describe('aritmetica sulle date', () => {
  it('attraversa fine mese, fine anno e anni bisestili', () => {
    expect(addDays(toIsoDate('2026-01-31'), 1)).toBe('2026-02-01')
    expect(addDays(toIsoDate('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(toIsoDate('2024-02-28'), 1)).toBe('2024-02-29')
    expect(addDays(toIsoDate('2026-03-01'), -1)).toBe('2026-02-28')
  })

  it('non slitta attorno al cambio dell’ora legale', () => {
    expect(addDays(toIsoDate('2026-03-28'), 1)).toBe('2026-03-29')
    expect(addDays(toIsoDate('2026-03-29'), 1)).toBe('2026-03-30')
    expect(addDays(toIsoDate('2026-10-24'), 2)).toBe('2026-10-26')
  })

  it('inizio e fine mese', () => {
    expect(startOfMonth(toIsoDate('2026-02-17'))).toBe('2026-02-01')
    expect(endOfMonth(toIsoDate('2026-02-17'))).toBe('2026-02-28')
    expect(endOfMonth(toIsoDate('2024-02-01'))).toBe('2024-02-29')
    expect(daysInMonth(2026, 9)).toBe(30)
  })
})

describe('formatIsoDate', () => {
  it('mostra lo stesso giorno in qualunque fuso del processo', () => {
    expect(formatIsoDate(toIsoDate('2026-10-03'), 'numeric')).toBe('03/10/2026')
    expect(formatIsoDate(toIsoDate('2026-01-01'), 'long')).toBe('1 gennaio 2026')
  })
})
