import { describe, expect, it } from 'vitest'

import { AUTO_APPLY_CONFIDENCE } from '@/lib/categorization/engine'
import { applyDecision, learnedConfidence, suggestionPattern, suggestRules, type ManualRow } from '@/lib/categorization/learn'

const row = (description: string, amount: number, categoryId: string | null, extra: Partial<ManualRow> = {}): ManualRow => ({
  description,
  amount,
  type: amount > 0 ? 'income' : 'expense',
  nature: 'personal',
  categoryId,
  businessId: null,
  incomeSourceId: null,
  ...extra,
})
const none = () => false

describe('regole imparate dalle correzioni', () => {
  it('stessa classificazione ripetuta → regola suggerita', () => {
    const [s, ...rest] = suggestRules([row('ESSELUNGA 1234 MILANO', -4500, 'spesa'), row('Esselunga 9876 Milano', -2300, 'spesa'), row('Bar Roma', -150, 'bar')], none)
    expect(rest).toEqual([])
    expect(s).toMatchObject({ pattern: 'esselunga', direction: 'out', categoryId: 'spesa', count: 2, conflicts: 0, confidence: 0.85 })
  })

  it('una volta sola, testi già coperti o trasferimenti: nessun suggerimento', () => {
    expect(suggestRules([row('Netflix', -1299, 'abbonamenti')], none)).toEqual([])
    expect(suggestRules([row('Netflix', -1299, 'abb'), row('Netflix', -1299, 'abb')], (p) => p === 'netflix')).toEqual([])
    expect(suggestRules([row('Giroconto', -100, null, { type: 'transfer', nature: 'transfer' }), row('Giroconto', -100, null, { type: 'transfer', nature: 'transfer' })], none)).toEqual([])
  })

  it('correzioni in disaccordo abbassano l’affidabilità o bloccano il suggerimento', () => {
    const rows = [...Array.from({ length: 4 }, () => row('Amazon', -2000, 'shopping')), row('Amazon', -2000, 'tecnologia')]
    expect(suggestRules(rows, none)[0]).toMatchObject({ count: 4, conflicts: 1, confidence: 0.76 })
    expect(suggestRules([row('Amazon', -1, 'a'), row('Amazon', -1, 'a'), row('Amazon', -1, 'b')], none)).toEqual([])
  })

  it('entrate e uscite con lo stesso testo restano separate', () => {
    const s = suggestRules([row('Etsy', 1200, 'vendite'), row('Etsy', 900, 'vendite'), row('Etsy', -300, 'commissioni'), row('Etsy', -200, 'commissioni')], none)
    expect(s.map((x) => x.direction).sort()).toEqual(['in', 'out'])
  })

  it('affidabilità: cresce con le conferme fino a 0,95', () => {
    expect([2, 3, 4, 10].map((n) => learnedConfidence(n))).toEqual([0.85, 0.9, 0.95, 0.95])
    expect(suggestionPattern('POS 12/09/2026 IPERCOOP 00123')).toBe('ipercoop')
    expect(suggestionPattern('PANIFICIO ROSSI 1234 TORINO')).toBe('panificio rossi')
  })
})

describe('nessuna applicazione automatica sotto soglia', () => {
  it('sopra o uguale alla soglia si applica, sotto si propone soltanto', () => {
    expect(AUTO_APPLY_CONFIDENCE).toBe(0.9)
    expect(applyDecision(0.95)).toBe('apply')
    expect(applyDecision(0.9)).toBe('apply')
    expect(applyDecision(0.89)).toBe('propose')
    expect(applyDecision(0.5)).toBe('propose')
  })
})
