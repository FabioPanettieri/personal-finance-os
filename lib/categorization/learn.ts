/**
 * Classificazione intelligente (Sprint 11): regole suggerite dalle correzioni
 * dell'utente e decisione "applica o proponi" in base all'affidabilità.
 *
 * Regola d'oro: sotto la soglia AUTO_APPLY_CONFIDENCE nulla viene applicato da
 * solo; la classificazione resta una proposta da confermare.
 */
import { normalizeDescription } from '../csv/values'
import type { TransactionNature, TransactionType } from '../imports/types'
import { AUTO_APPLY_CONFIDENCE } from './engine'

export type ManualRow = {
  description: string
  amount: number
  type: TransactionType
  nature: TransactionNature
  categoryId: string | null
  businessId: string | null
  incomeSourceId: string | null
}

export type RuleSuggestion = {
  pattern: string
  direction: 'in' | 'out'
  type: TransactionType
  nature: TransactionNature
  categoryId: string | null
  businessId: string | null
  incomeSourceId: string | null
  /** Movimenti classificati così dall'utente. */
  count: number
  /** Movimenti con lo stesso testo classificati in altro modo. */
  conflicts: number
  confidence: number
}

/** Le correzioni coerenti devono essere almeno l'80% del totale per proporre una regola. */
export const MIN_AGREEMENT = 0.8
export const MIN_OCCURRENCES = 2

/** Affidabilità imparata: cresce con le conferme, mai oltre 0,95; scende con i disaccordi. */
export function learnedConfidence(count: number, conflicts = 0): number {
  const base = Math.min(0.95, 0.75 + 0.05 * count)
  const agreement = count / (count + conflicts)
  return Math.round(base * agreement * 100) / 100
}

/**
 * Testo da cercare: il tratto più lungo della descrizione normalizzata senza
 * numeri (date, riferimenti, numeri di negozio variano da un movimento
 * all'altro), così la regola "contiene" trova anche i prossimi movimenti.
 */
export function suggestionPattern(description: string): string {
  const runs: string[][] = [[]]
  for (const token of normalizeDescription(description).split(' ').filter(Boolean)) {
    if (/\d/.test(token)) runs.push([])
    else runs.at(-1)!.push(token)
  }
  const best = runs.map((r) => r.join(' ')).sort((a, b) => b.length - a.length)[0] ?? ''
  return best.slice(0, 120)
}

const signature = (r: ManualRow) => [r.type, r.nature, r.categoryId, r.businessId, r.incomeSourceId].join('|')

/**
 * Raggruppa per testo e direzione i movimenti classificati a mano e propone
 * una regola quando la stessa classificazione si ripete. `covered` esclude i
 * testi già gestiti da una regola attiva.
 */
export function suggestRules(rows: readonly ManualRow[], covered: (pattern: string, direction: 'in' | 'out') => boolean): RuleSuggestion[] {
  const groups = new Map<string, ManualRow[]>()
  for (const row of rows) {
    if (row.type === 'transfer' || row.type === 'investment') continue
    const pattern = suggestionPattern(row.description)
    if (pattern.length < 3) continue
    const key = `${pattern}#${row.amount > 0 ? 'in' : 'out'}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const out: RuleSuggestion[] = []
  for (const [key, list] of groups) {
    const [pattern, direction] = key.split('#') as [string, 'in' | 'out']
    if (covered(pattern, direction)) continue
    const bySignature = new Map<string, ManualRow[]>()
    for (const r of list) bySignature.set(signature(r), [...(bySignature.get(signature(r)) ?? []), r])
    const [top] = [...bySignature.values()].sort((a, b) => b.length - a.length)
    if (!top || top.length < MIN_OCCURRENCES || top.length / list.length < MIN_AGREEMENT) continue
    const sample = top[0]!
    out.push({
      pattern,
      direction,
      type: sample.type,
      nature: sample.nature,
      categoryId: sample.categoryId,
      businessId: sample.businessId,
      incomeSourceId: sample.incomeSourceId,
      count: top.length,
      conflicts: list.length - top.length,
      confidence: learnedConfidence(top.length, list.length - top.length),
    })
  }
  return out.sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern))
}

/** Cosa fare con una classificazione proposta da una regola. */
export function applyDecision(confidence: number): 'apply' | 'propose' {
  return confidence >= AUTO_APPLY_CONFIDENCE ? 'apply' : 'propose'
}
