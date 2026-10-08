import { describe, expect, it } from 'vitest'

import { splitAccounts } from '@/features/accounts/split'
import { accountColor, bankForAccount, bankGradient } from '@/lib/banks'
import { choicesFor, EXPENSE_CHOICES, findChoice, INCOME_CHOICES } from '@/lib/transactions/quick-choices'

describe('banche', () => {
  it('riconosce la banca da istituto o nome', () => {
    expect(bankForAccount({ institution: 'Revolut', name: 'Conto' })).toBe('revolut')
    expect(bankForAccount({ institution: null, name: 'ING Direct' })).toBe('ing')
    expect(bankForAccount({ institution: 'ING', name: 'Conto Risparmio' })).toBe('ing')
    expect(bankForAccount({ institution: 'Trade Republic', name: 'Broker' })).toBe('trade_republic')
    // "ing" dentro una parola non è ING.
    expect(bankForAccount({ institution: null, name: 'Shopping Card' })).toBeNull()
    expect(bankForAccount({ institution: 'Contanti', name: 'Portafoglio' })).toBeNull()
  })

  it('il colore segue la banca, altrimenti quello del conto', () => {
    expect(accountColor({ name: 'Revolut', color: '#000000' })).toBe('var(--bank-revolut)')
    expect(accountColor({ name: 'ING Direct' })).toBe('var(--bank-ing)')
    expect(accountColor({ name: 'Trade Republic' })).toBe('var(--bank-tr)')
    expect(accountColor({ name: 'Contanti', color: '#123456' })).toBe('#123456')
    expect(accountColor({ name: 'Contanti', color: null })).toBe('var(--fg-subtle)')
    expect(bankGradient('var(--bank-ing)')).toContain('var(--bank-ing)')
  })
})

describe('conti principali e secondari', () => {
  const acc = (name: string, code: string, isActive = true, balance = 100) => ({ name, institution: null, isActive, balance, type: { code } })

  it('carte per i conti delle tre banche in ordine Revolut, ING, Trade Republic', () => {
    const { main, other } = splitAccounts([
      acc('Trade Republic', 'broker'),
      acc('ING Direct', 'checking'),
      acc('ING Conto Risparmio', 'savings'),
      acc('Revolut', 'checking'),
      acc('Contanti', 'cash'),
    ])
    expect(main.map((a) => a.name)).toEqual(['Revolut', 'ING Direct', 'Trade Republic'])
    expect(other.map((a) => a.name)).toEqual(['ING Conto Risparmio', 'Contanti'])
  })

  it('i conti disattivati compaiono solo con un saldo', () => {
    const { main, other } = splitAccounts([acc('Revolut', 'checking', false, 0), acc('Vecchio', 'cash', false, 500)])
    expect(main).toEqual([])
    expect(other.map((a) => a.name)).toEqual(['Vecchio'])
  })
})

describe('scelte rapide', () => {
  it('le entrate propongono solo scelte da entrata e viceversa', () => {
    expect(choicesFor(1000)).toBe(INCOME_CHOICES)
    expect(choicesFor(-1000)).toBe(EXPENSE_CHOICES)
    expect(INCOME_CHOICES.every((c) => c.type !== 'expense' && c.type !== 'investment')).toBe(true)
    expect(EXPENSE_CHOICES.every((c) => c.type !== 'income' && c.type !== 'refund')).toBe(true)
  })

  it('chiavi uniche e coerenti tra tipo e natura', () => {
    for (const list of [INCOME_CHOICES, EXPENSE_CHOICES]) {
      expect(new Set(list.map((c) => c.key)).size).toBe(list.length)
      for (const c of list) {
        if (c.type === 'transfer') expect(c.nature).toBe('transfer')
        if (c.nature === 'business') expect(c.businessSlug).not.toBeNull()
        if (c.incomeSourceName) expect(c.type).toBe('income')
      }
    }
  })

  it('findChoice rispetta il segno', () => {
    expect(findChoice(-500, 'cat:Casa')?.categoryPath).toBe('Casa')
    expect(findChoice(500, 'cat:Casa')).toBeNull()
    expect(findChoice(500, 'salary')?.incomeSourceName).toBe('Stipendio')
    expect(findChoice(-500, 'inesistente')).toBeNull()
  })
})
