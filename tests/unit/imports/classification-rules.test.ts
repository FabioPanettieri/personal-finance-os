import { describe, expect, it } from 'vitest'

import { classify } from '@/lib/categorization/engine'
import type { Rule } from '@/lib/categorization/rules'
import { cents } from '@/lib/money'

import { fixture, LOOKUPS, preview } from './helpers'
import { SEED_RULES } from './seed-rules'

const byDescription = async () => {
  const rows = await preview('revolut', fixture('revolut/formato-reale.csv'), {}, 'acc-rev')
  return new Map(rows.map((r) => [r.transaction!.description, r]))
}

describe('regole di classificazione iniziali (dal database)', () => {
  it('incassi: Etsy e Stripe → VOXEL Studio vendite; Google Ireland → YouTube', async () => {
    const rows = await byDescription()
    for (const d of ['Pagamento da ETSY PAYMENTS', 'Pagamento da STRIPE']) {
      expect(rows.get(d)!.classification).toMatchObject({ type: 'income', nature: 'business', categoryId: 'cat:Vendite', businessId: 'biz:voxel-studio', incomeSourceId: 'src:VOXEL Studio', needsReview: false })
    }
    expect(rows.get('Pagamento da GOOGLE IRELAND LIMITED')!.classification).toMatchObject({
      type: 'income', categoryId: 'cat:YouTube', businessId: 'biz:il-progettista-meccanico', incomeSourceId: 'src:YouTube',
    })
  })

  it('spese VOXEL: Packlink spedizioni, Elegoo materiali, Aruba e GoDaddy software', async () => {
    const rows = await byDescription()
    expect(rows.get('Packlink')!.classification).toMatchObject({ type: 'expense', nature: 'business', categoryId: 'cat:Business > Spedizioni', businessId: 'biz:voxel-studio' })
    expect(rows.get('Elegoo')!.classification).toMatchObject({ categoryId: 'cat:Business > Materiali', businessId: 'biz:voxel-studio' })
    expect(rows.get('Aruba')!.classification).toMatchObject({ categoryId: 'cat:Business > Software', businessId: 'biz:voxel-studio' })
    expect(rows.get('GoDaddy')!.classification).toMatchObject({ categoryId: 'cat:Business > Software', businessId: 'biz:voxel-studio' })
  })

  it('Mangopay, PayPal, privati e ricariche proprie senza controparte restano da verificare', async () => {
    const rows = await byDescription()
    for (const d of ['Pagamento da MANGOPAY', 'Pagamento da PAYPAL EUROPE', 'PayPal', 'Da parte di Luca Bianchi', 'Pagamento da Mario Rossi']) {
      expect(rows.get(d)!.needsReview).toBe(true)
      expect(rows.get(d)!.classification!.type).toBeNull()
    }
  })

  it('nessuna regola Mangopay nel seed', () => {
    expect(SEED_RULES.some((r) => /mangopay/i.test(r.pattern))).toBe(false)
  })

  it('le regole si applicano in ordine di priorità, a parità per nome', () => {
    const base: Omit<Rule, 'id' | 'name' | 'priority' | 'setCategoryPath'> = {
      dbId: 'x', matchField: 'description', matchType: 'contains', pattern: 'acme', accountId: null, direction: 'out',
      amountMinCents: null, amountMaxCents: null, setType: 'expense', setNature: 'personal', confidence: 0.9,
    }
    const rules: Rule[] = [
      { ...base, id: 'b', name: 'B', priority: 200, setCategoryPath: 'Salute' },
      { ...base, id: 'a', name: 'A', priority: 100, setCategoryPath: 'Abbonamenti' },
    ]
    const input = { source: 'revolut' as const, description: 'ACME srl', counterparty: null, amount: cents(-100), hint: null, movement: 'cash' as const, accountId: 'acc' }
    expect(classify(input, rules, LOOKUPS).categoryId).toBe('cat:Abbonamenti')
    expect(classify(input, [{ ...rules[0]!, priority: 50 }, rules[1]!], LOOKUPS).categoryId).toBe('cat:Salute')
  })

  it('confronto su causale/tipo della banca e su IBAN della controparte', () => {
    const base: Rule = {
      id: 'r', dbId: 'r', name: 'r', priority: 1, matchField: 'source_type', matchType: 'equals', pattern: 'Accredito Stipendio/Pensione',
      accountId: null, direction: 'in', amountMinCents: null, amountMaxCents: null, setType: 'income', setNature: 'personal', setCategoryPath: 'Stipendio', confidence: 0.95,
    }
    const input = { source: 'ing' as const, description: 'Bonifico', counterparty: null, amount: cents(1000), hint: null, movement: 'cash' as const, accountId: 'acc', sourceType: 'Accredito Stipendio/Pensione' }
    expect(classify(input, [base], LOOKUPS)).toMatchObject({ type: 'income', categoryId: 'cat:Stipendio' })
    const ibanRule: Rule = { ...base, matchField: 'counterparty_iban', pattern: 'it00 c000 0000 0000 0000 0000 005' }
    expect(classify({ ...input, sourceType: null, counterpartyIban: 'IT00C0000000000000000000005' }, [ibanRule], LOOKUPS).type).toBe('income')
  })

  it('una regola con motivo di revisione lascia la riga da verificare con il motivo', () => {
    const review: Rule = {
      id: 'r', dbId: 'r', name: 'r', priority: 1, matchField: 'description', matchType: 'contains', pattern: 'mangopay', accountId: null, direction: 'in',
      amountMinCents: null, amountMaxCents: null, setType: null, setNature: null, confidence: 0, review: 'Mangopay: da verificare',
    }
    const out = classify({ source: 'revolut', description: 'Pagamento da MANGOPAY', counterparty: null, amount: cents(3000), hint: null, movement: 'cash', accountId: 'a' }, [review], LOOKUPS)
    expect(out).toMatchObject({ type: null, needsReview: true })
    expect(out.reasons).toContain('Mangopay: da verificare')
  })

  it('conto di destinazione della regola ignorato se coincide con il conto importato', () => {
    const rule: Rule = { ...SEED_RULES.find((r) => r.setTransferAccountId)!, setTransferAccountId: 'acc' }
    const out = classify({ source: 'ing', description: 'x', counterparty: null, amount: cents(-100), hint: null, movement: 'cash', accountId: 'acc', sourceType: 'Addebito Carta Di Credito' }, [rule], LOOKUPS)
    expect(out).toMatchObject({ type: 'transfer', transferAccountId: null })
  })
})
