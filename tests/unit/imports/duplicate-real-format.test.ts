import { describe, expect, it } from 'vitest'

import { fixture, preview } from './helpers'

describe('duplicati — formati reali', () => {
  it('ING: due uscite identiche lo stesso giorno sono due movimenti distinti', async () => {
    const rows = (await preview('ing', fixture('ing/formato-reale.csv'))).filter((r) => r.transaction?.bookedOn === '2026-09-01' && r.transaction.amount === -5000)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'new')).toBe(true)
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(2)
  })

  it('Revolut: righe identiche nello stesso file restano entrambe (indice di occorrenza)', async () => {
    const rows = (await preview('revolut', fixture('revolut/formato-reale.csv'))).filter((r) => r.transaction?.description === 'Esselunga')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'new')).toBe(true)
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(2)
  })

  it('reimportare lo stesso file: tutte duplicate, nessuna nuova', async () => {
    for (const [source, file, account] of [['ing', 'ing/formato-reale.csv', 'acc-ing'], ['revolut', 'revolut/formato-reale.csv', 'acc-rev']] as const) {
      const first = await preview(source, fixture(file), {}, account)
      const existingCash = first
        .filter((r) => r.status === 'new')
        .map((r, i) => ({ id: `tx-${i}`, fingerprint: r.fingerprint!, bookedOn: r.transaction!.bookedOn, amount: r.transaction!.amount }))
      const second = await preview(source, fixture(file), { existingCash }, account)
      expect(second.filter((r) => r.status === 'new')).toHaveLength(0)
      expect(second.filter((r) => r.status === 'duplicate')).toHaveLength(existingCash.length)
    }
  })

  it('stesso file su un altro conto: fingerprint diversi (il conto fa parte della chiave)', async () => {
    const a = await preview('ing', fixture('ing/formato-reale.csv'), {}, 'acc-1')
    const b = await preview('ing', fixture('ing/formato-reale.csv'), {}, 'acc-2')
    expect(a.find((r) => r.fingerprint)!.fingerprint).not.toBe(b.find((r) => r.fingerprint)!.fingerprint)
  })
})
