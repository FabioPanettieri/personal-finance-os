import { normalizeDescription } from '../csv/values'
import type { ImportSource, NormalizedTransaction, TransactionNature, TransactionType } from '../imports/types'
import type { Rule } from './rules'

/** Soglie (docs/00-architecture.md §9). */
export const AUTO_APPLY_CONFIDENCE = 0.9
export const REVIEW_BELOW_CONFIDENCE = 0.6

export type Lookups = {
  categoryIdByPath: ReadonlyMap<string, string>
  businessIdBySlug: ReadonlyMap<string, string>
  incomeSourceIdByName: ReadonlyMap<string, string>
  /** Business collegato a una fonte di reddito (es. YouTube → Il Progettista Meccanico). */
  businessIdByIncomeSourceId: ReadonlyMap<string, string>
}

export type Classification = {
  type: TransactionType | null
  nature: TransactionNature | null
  categoryId: string | null
  businessId: string | null
  incomeSourceId: string | null
  confidence: number
  method: 'rule' | 'none'
  /** Regola del database applicata (le predefinite non hanno id DB). */
  ruleDbId: string | null
  reasons: string[]
  needsReview: boolean
}

export type ClassifyInput = Pick<
  NormalizedTransaction,
  'source' | 'description' | 'counterparty' | 'amount' | 'hint' | 'movement'
> & { accountId: string }

export function signAllows(type: TransactionType, amount: number): boolean {
  if (type === 'income' || type === 'refund') return amount > 0
  if (type === 'expense') return amount < 0
  return true
}

export function deriveNature(
  type: TransactionType,
  businessId: string | null,
  preferred: TransactionNature | null = null,
): TransactionNature {
  if (type === 'transfer') return 'transfer'
  if (type === 'investment') return 'investment'
  if (preferred && preferred !== 'transfer') return preferred
  return businessId ? 'business' : 'personal'
}

function ruleMatches(rule: Rule, input: ClassifyInput, text: { description: string; counterparty: string }): boolean {
  if (rule.accountId && rule.accountId !== input.accountId) return false
  if (rule.sources && !rule.sources.includes(input.source as ImportSource)) return false
  if (rule.direction === 'in' && input.amount <= 0) return false
  if (rule.direction === 'out' && input.amount >= 0) return false
  const absolute = Math.abs(input.amount)
  if (rule.amountMinCents !== null && absolute < rule.amountMinCents) return false
  if (rule.amountMaxCents !== null && absolute > rule.amountMaxCents) return false

  const haystack = rule.matchField === 'counterparty' ? text.counterparty : text.description
  if (!haystack) return false
  switch (rule.matchType) {
    case 'contains':
      return haystack.includes(normalizeDescription(rule.pattern))
    case 'equals':
      return haystack === normalizeDescription(rule.pattern)
    case 'starts_with':
      return haystack.startsWith(normalizeDescription(rule.pattern))
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(haystack)
      } catch {
        return false
      }
  }
}

/**
 * Classificazione multilivello: suggerimento strutturale della fonte, poi la
 * prima regola applicabile (regole utente prima delle predefinite). Mai un
 * tipo incompatibile con il segno dell'importo; se nulla è abbastanza sicuro
 * la riga resta da verificare.
 */
export function classify(input: ClassifyInput, rules: readonly Rule[], lookups: Lookups): Classification {
  const result: Classification = {
    type: null,
    nature: null,
    categoryId: null,
    businessId: null,
    incomeSourceId: null,
    confidence: 0,
    method: 'none',
    ruleDbId: null,
    reasons: [],
    needsReview: true,
  }

  const hint = input.hint
  if (hint?.type && signAllows(hint.type, input.amount)) {
    result.type = hint.type
    result.nature = hint.nature ?? null
    result.categoryId = hint.categoryPath ? (lookups.categoryIdByPath.get(hint.categoryPath) ?? null) : null
    result.confidence = hint.confidence
    result.method = 'rule'
    result.reasons.push(hint.reason)
  } else if (hint) {
    result.reasons.push(hint.reason)
  }

  // Le operazioni su strumenti sono decise dalla struttura del file, non da parole chiave.
  if (input.movement !== 'trade') {
    const text = { description: normalizeDescription(input.description), counterparty: normalizeDescription(input.counterparty ?? '') }
    const ordered = [...rules].sort((a, b) => (a.dbId === null ? 1 : 0) - (b.dbId === null ? 1 : 0) || a.priority - b.priority)
    for (const rule of ordered) {
      if (!ruleMatches(rule, input, text)) continue
      if (rule.review) {
        if (!result.type) result.reasons.push(rule.review)
        break
      }
      if (rule.setType && !signAllows(rule.setType, input.amount)) continue
      if (rule.setType && result.type && rule.setType !== result.type && result.confidence >= rule.confidence) continue

      if (rule.setType) result.type = rule.setType
      if (rule.setNature) result.nature = rule.setNature
      const categoryId = rule.setCategoryId ?? (rule.setCategoryPath ? lookups.categoryIdByPath.get(rule.setCategoryPath) : undefined)
      if (categoryId) result.categoryId = categoryId
      const businessId = rule.setBusinessId ?? (rule.setBusinessSlug ? lookups.businessIdBySlug.get(rule.setBusinessSlug) : undefined)
      if (businessId) result.businessId = businessId
      const incomeSourceId =
        rule.setIncomeSourceId ?? (rule.setIncomeSourceName ? lookups.incomeSourceIdByName.get(rule.setIncomeSourceName) : undefined)
      if (incomeSourceId) result.incomeSourceId = incomeSourceId
      result.confidence = Math.max(result.confidence, rule.confidence)
      result.method = 'rule'
      if (rule.dbId) result.ruleDbId = rule.dbId
      result.reasons.push(`Regola: ${rule.name}`)
      break
    }
  }

  const final = finalizeClassification(result, input.amount, lookups)
  // Gli acquisti/vendite di titoli non hanno categoria di spesa: vanno in investment_transactions.
  if (input.movement === 'trade') final.categoryId = null
  return final
}

/** Coerenza finale: natura, fonte di reddito solo su entrate, categorie dei trasferimenti. */
export function finalizeClassification(result: Classification, amount: number, lookups: Lookups): Classification {
  if (!result.type) {
    return { ...result, nature: null, categoryId: null, businessId: null, incomeSourceId: null, confidence: 0, method: 'none', needsReview: true }
  }
  if (result.type !== 'income') result.incomeSourceId = null
  if (result.incomeSourceId && !result.businessId) {
    result.businessId = lookups.businessIdByIncomeSourceId.get(result.incomeSourceId) ?? null
  }
  if (!result.categoryId && result.type === 'transfer') {
    result.categoryId = lookups.categoryIdByPath.get('Trasferimenti > Giroconto') ?? null
  }
  if (!result.categoryId && result.type === 'investment' && amount < 0) {
    result.categoryId = lookups.categoryIdByPath.get('Investimenti > Versamenti') ?? null
  }
  result.nature = deriveNature(result.type, result.businessId, result.nature)
  result.needsReview = result.confidence < REVIEW_BELOW_CONFIDENCE
  return result
}
