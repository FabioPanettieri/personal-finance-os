import { describe, expect, it } from 'vitest'

import { toIsoDate } from '@/lib/dates'
import type { OwnAccount } from '@/lib/imports/pipeline'
import { detectTransfers, type Counterpart } from '@/lib/transfers/detect'

import { fixture, preview } from './helpers'
import { CARD_ACCOUNT_ID } from './seed-rules'

const OWN: OwnAccount[] = [
  { id: 'acc-ing', name: 'ING Direct', kind: 'liquid', iban: 'IT00I0000000000000000000001', importable: true },
  { id: 'acc-sav', name: 'ING Conto Risparmio', kind: 'liquid', iban: 'IT00A0000000000000000000002', importable: false },
  { id: 'acc-rev', name: 'Revolut', kind: 'liquid', iban: 'IT00R0000000000000000000003', importable: true },
  { id: CARD_ACCOUNT_ID, name: 'Carta di credito', kind: 'liquid', iban: null, importable: false },
  { id: 'acc-tr', name: 'Trade Republic', kind: 'investment', iban: null, importable: true },
]

const ingPreview = () => preview('ing', fixture('ing/formato-reale.csv'), { ownAccounts: OWN }, 'acc-ing')

describe('trasferimenti — formati reali', () => {
  it('ING → Revolut: IBAN del beneficiario = conto Revolut, trasferimento certo', async () => {
    const rows = (await ingPreview()).filter((r) => r.transaction?.counterpartyIban === 'IT00R0000000000000000000003')
    expect(rows).toHaveLength(6)
    for (const row of rows) {
      expect(row.classification).toMatchObject({ type: 'transfer', nature: 'transfer', transferAccountId: 'acc-rev', categoryId: 'cat:Trasferimenti > Giroconto' })
      expect(row.needsReview).toBe(false)
      // Revolut è alimentato dai suoi estratti: nessuna contropartita creata qui.
      expect(row.messages.join()).not.toMatch(/contropartita/)
    }
  })

  it('ING ↔ ING Conto Risparmio: trasferimento in entrambe le direzioni, con contropartita', async () => {
    const rows = (await ingPreview()).filter((r) => r.transferAccountId === 'acc-sav')
    expect(rows.map((r) => r.transaction!.amount)).toEqual([100000, 20000, -120000])
    for (const row of rows) {
      expect(row.classification!.type).toBe('transfer')
      expect(row.messages.join()).toMatch(/contropartita sul conto ING Conto Risparmio/)
    }
  })

  it('addebito carta di credito: movimento verso il conto Carta di credito, non una spesa', async () => {
    const card = (await ingPreview()).find((r) => r.transaction?.sourceType === 'Addebito Carta Di Credito')!
    expect(card.classification).toMatchObject({ type: 'transfer', transferAccountId: CARD_ACCOUNT_ID })
    expect(card.messages.join()).toMatch(/contropartita sul conto Carta di credito/)
  })

  it('stipendio dalla descrizione reale (RETRIBUZIONE) → entrata Stipendio', async () => {
    const salary = (await ingPreview()).find((r) => r.transaction?.sourceType === 'Accredito Stipendio/Pensione')!
    expect(salary.classification).toMatchObject({ type: 'income', categoryId: 'cat:Stipendio', incomeSourceId: 'src:Stipendio' })
  })

  it('Revolut ← ING: due -50 e due +50 lo stesso giorno si abbinano uno-a-uno, senza "ambiguo"', async () => {
    const ing = (id: string, date: string, amount: number): Counterpart => ({
      id, accountId: 'acc-ing', accountName: 'ING Direct', accountKind: 'liquid', bookedOn: toIsoDate(date), amount, type: 'transfer',
    })
    const counterparts = [
      ing('ing-a', '2026-09-01', -5000), ing('ing-b', '2026-09-01', -5000), ing('ing-c', '2026-09-07', -12000),
      ing('ing-d', '2026-09-26', -8000), ing('ing-e', '2026-10-01', -5000), ing('ing-f', '2026-10-01', -5000),
    ]
    const rows = await preview('revolut', fixture('revolut/formato-reale.csv'), { counterparts, ownAccounts: OWN }, 'acc-rev')
    const own = rows.filter((r) => r.transaction?.description === 'Pagamento da Mario Rossi')
    expect(own.map((r) => r.transferCandidateId)).toEqual(['ing-a', 'ing-b', 'ing-c', 'ing-d', 'ing-e', 'ing-f'])
    for (const row of own) {
      expect(row.classification).toMatchObject({ type: 'transfer', transferAccountId: 'acc-ing' })
      expect(row.needsReview).toBe(false)
      expect(row.messages.join()).not.toMatch(/Più movimenti/)
    }
  })

  it('Revolut → Trade Republic: investimento (regola iniziale), non spesa', async () => {
    const rows = await preview('revolut', fixture('revolut/formato-reale.csv'), { ownAccounts: OWN }, 'acc-rev')
    const tr = rows.find((r) => r.transaction?.description === 'A favore di Trade Republic')!
    expect(tr.classification).toMatchObject({ type: 'investment', nature: 'investment' })
  })

  it('il conto di destinazione noto filtra i candidati su altri conti', () => {
    const c = (id: string, accountId: string): Counterpart => ({
      id, accountId, accountName: accountId, accountKind: 'liquid', bookedOn: toIsoDate('2026-09-01'), amount: 5000, type: 'transfer',
    })
    const row = { bookedOn: toIsoDate('2026-09-01'), amount: -5000, type: 'transfer', confidence: 0.95, movement: 'cash' as const, eligible: true }
    expect(detectTransfers([row], 'liquid', [c('x', 'acc-rev'), c('y', 'acc-sav')])[0]).toEqual({ ambiguous: true })
    expect(detectTransfers([{ ...row, targetAccountId: 'acc-sav' }], 'liquid', [c('x', 'acc-rev'), c('y', 'acc-sav')])[0]).toMatchObject({ counterpart: { id: 'y' } })
  })

  it('protezioni invariate: una spesa sicura non viene trasformata in trasferimento', () => {
    const c: Counterpart = { id: 'x', accountId: 'acc-rev', accountName: 'Revolut', accountKind: 'liquid', bookedOn: toIsoDate('2026-09-01'), amount: 5000, type: 'transfer' }
    const row = { bookedOn: toIsoDate('2026-09-01'), amount: -5000, type: 'expense', confidence: 0.9, movement: 'cash' as const, eligible: true }
    expect(detectTransfers([row], 'liquid', [c])[0]).toBeNull()
    expect(detectTransfers([{ ...row, type: null, confidence: 0, eligible: false }], 'liquid', [c])[0]).toBeNull()
  })
})
