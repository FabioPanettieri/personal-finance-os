import { normalizeDescription } from '../csv/values'
import type { NormalizedTransaction } from './types'

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chiave di occorrenza: due righe identiche nello stesso file hanno la stessa chiave. */
export function occurrenceKey(tx: Pick<NormalizedTransaction, 'bookedOn' | 'amount' | 'description'>): string {
  return `${tx.bookedOn}|${tx.amount}|${normalizeDescription(tx.description)}`
}

/**
 * Indice di occorrenza per ogni transazione senza identificativo esterno:
 * la prima di un gruppo identico ha 0, la seconda 1… (stesso ordine del file).
 */
export function assignOccurrences(transactions: readonly NormalizedTransaction[]): number[] {
  const seen = new Map<string, number>()
  return transactions.map((tx) => {
    if (tx.externalId) return 0
    const key = occurrenceKey(tx)
    const index = seen.get(key) ?? 0
    seen.set(key, index + 1)
    return index
  })
}

/**
 * Fingerprint (docs/00-architecture.md §8):
 * - con identificativo della fonte: sha256(fonte | id) — stabile anche se la descrizione cambia;
 * - altrimenti: sha256(conto | data | importo | descrizione normalizzata | occorrenza).
 */
export async function fingerprintFor(
  tx: Pick<NormalizedTransaction, 'source' | 'externalId' | 'bookedOn' | 'amount' | 'description'>,
  accountId: string,
  occurrence: number,
): Promise<string> {
  if (tx.externalId) return sha256Hex(`ext|${tx.source}|${tx.externalId}`)
  return sha256Hex(`${accountId}|${occurrenceKey(tx)}|${occurrence}`)
}

/** Movimento secondario (commissione/imposta) derivato in modo deterministico dalla riga. */
export function secondaryFingerprint(mainFingerprint: string, part: 'fee' | 'tax'): Promise<string> {
  return sha256Hex(`${mainFingerprint}|${part}`)
}

/** Contropartita di un trasferimento verso un conto non alimentato da estratti (es. Carta di credito). */
export function mirrorFingerprint(mainFingerprint: string): Promise<string> {
  return sha256Hex(`${mainFingerprint}|mirror`)
}
