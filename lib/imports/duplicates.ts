import { addDays, compareIsoDates, type IsoDate } from '../dates'

export type DuplicateStatus = 'new' | 'duplicate' | 'possible_duplicate'

export type DuplicateCandidate = {
  fingerprint: string
  bookedOn: IsoDate
  amount: number
  /** Le operazioni su titoli si confrontano con investment_transactions. */
  movement: 'cash' | 'trade'
}

export type ExistingTransaction = { id: string; fingerprint: string; bookedOn: IsoDate; amount: number }

export type DuplicateVerdict = { status: DuplicateStatus; duplicateOfId: string | null; reason: string | null }

export const POSSIBLE_DUPLICATE_DAYS = 2

/**
 * Stato di deduplicazione di ogni riga:
 * - duplicate: stesso fingerprint già nel database, o ripetuto nel file
 *   (stesso identificativo della fonte);
 * - possible_duplicate: nessun fingerprint uguale, ma un movimento esistente
 *   con stesso importo entro ±2 giorni non riconducibile ad altre righe
 *   (es. inserito a mano). Mai importata senza conferma;
 * - new: altrimenti.
 */
export function detectDuplicates(
  candidates: readonly DuplicateCandidate[],
  existingCash: readonly ExistingTransaction[],
  existingTradeFingerprints: ReadonlySet<string>,
): DuplicateVerdict[] {
  const byFingerprint = new Map(existingCash.map((tx) => [tx.fingerprint, tx]))
  const seenInFile = new Set<string>()
  const verdicts: DuplicateVerdict[] = candidates.map((c) => {
    if (seenInFile.has(c.fingerprint)) {
      return { status: 'duplicate', duplicateOfId: null, reason: 'Ripetuta nel file con lo stesso identificativo' }
    }
    seenInFile.add(c.fingerprint)
    if (c.movement === 'trade') {
      return existingTradeFingerprints.has(c.fingerprint)
        ? { status: 'duplicate', duplicateOfId: null, reason: 'Operazione già importata' }
        : { status: 'new', duplicateOfId: null, reason: null }
    }
    const exact = byFingerprint.get(c.fingerprint)
    return exact
      ? { status: 'duplicate', duplicateOfId: exact.id, reason: 'Movimento già importato' }
      : { status: 'new', duplicateOfId: null, reason: null }
  })

  // Movimenti esistenti già riconosciuti esattamente non segnalano altre righe.
  const matchedIds = new Set(verdicts.map((v) => v.duplicateOfId).filter(Boolean))
  const pool = existingCash.filter((tx) => !matchedIds.has(tx.id))
  const used = new Set<string>()

  return verdicts.map((verdict, index) => {
    const c = candidates[index]!
    if (verdict.status !== 'new' || c.movement === 'trade') return verdict
    const from = addDays(c.bookedOn, -POSSIBLE_DUPLICATE_DAYS)
    const to = addDays(c.bookedOn, POSSIBLE_DUPLICATE_DAYS)
    const near = pool.find(
      (tx) =>
        !used.has(tx.id) &&
        tx.amount === c.amount &&
        compareIsoDates(tx.bookedOn, from) >= 0 &&
        compareIsoDates(tx.bookedOn, to) <= 0,
    )
    if (!near) return verdict
    used.add(near.id)
    return {
      status: 'possible_duplicate',
      duplicateOfId: near.id,
      reason: `Possibile duplicato di un movimento del ${near.bookedOn} con lo stesso importo`,
    }
  })
}
