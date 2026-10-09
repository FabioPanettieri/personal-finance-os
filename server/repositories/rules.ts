import { AUTO_APPLY_CONFIDENCE, classify, type ClassifyInput } from '@/lib/categorization/engine'
import { applyDecision, suggestRules, type ManualRow, type RuleSuggestion } from '@/lib/categorization/learn'
import type { Rule } from '@/lib/categorization/rules'
import type { ImportSource } from '@/lib/imports/types'
import { findChoice } from '@/lib/transactions/quick-choices'

import { RepositoryError, type DbClient } from './accounts'
import { loadClassificationData } from './import-context'
import { resolveChoice } from './transactions'

/**
 * Regole di classificazione: elenco leggibile, creazione (a mano o da un
 * suggerimento), attivazione, anteprima e riapplicazione ai movimenti da
 * sistemare. Sotto la soglia di affidabilità le regole propongono soltanto.
 */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

/** Quanti movimenti esaminare per anteprime e suggerimenti (i più recenti). */
const SCAN_LIMIT = 3000

export type RuleView = {
  id: string
  name: string
  origin: 'system' | 'user' | 'learned'
  isActive: boolean
  matchField: string
  matchType: string
  pattern: string
  direction: 'in' | 'out' | 'any'
  amountMinCents: number | null
  amountMaxCents: number | null
  setType: string | null
  target: string | null
  reviewReason: string | null
  confidence: number
  autoApply: boolean
  hitCount: number
  priority: number
}

export async function listRules(db: DbClient): Promise<RuleView[]> {
  const { data, error } = await db
    .from('categorization_rules')
    .select(
      'id, name, origin, is_active, match_field, match_type, pattern, direction, amount_min_cents, amount_max_cents, set_type, review_reason, confidence, hit_count, priority, transaction_categories(name), businesses(name), income_sources(name)',
    )
    .order('priority')
    .order('name')
  if (error) fail('Regole', error)
  return data.map((r) => {
    const row = r as typeof r & {
      transaction_categories: { name: string } | null
      businesses: { name: string } | null
      income_sources: { name: string } | null
    }
    return {
      id: row.id,
      name: row.name,
      origin: row.origin,
      isActive: row.is_active,
      matchField: row.match_field,
      matchType: row.match_type,
      pattern: row.pattern,
      direction: row.direction === 'in' || row.direction === 'out' ? row.direction : 'any',
      amountMinCents: row.amount_min_cents,
      amountMaxCents: row.amount_max_cents,
      setType: row.set_type,
      target: [row.businesses?.name, row.transaction_categories?.name, row.income_sources?.name].filter(Boolean).join(' · ') || null,
      reviewReason: row.review_reason,
      confidence: Number(row.confidence),
      autoApply: Number(row.confidence) >= AUTO_APPLY_CONFIDENCE,
      hitCount: row.hit_count,
      priority: row.priority,
    }
  })
}

export type NewRule = {
  pattern: string
  matchField: 'description' | 'counterparty'
  matchType: 'contains' | 'starts_with' | 'equals'
  direction: 'in' | 'out'
  amountMinCents: number | null
  amountMaxCents: number | null
  choiceKey: string
  /** true = applica da sola (0,95); false = proponi soltanto (0,7). */
  autoApply: boolean
}

export type RuleResult = { ok: true; id: string } | { ok: false; error: string }

export async function createRule(db: DbClient, input: NewRule): Promise<RuleResult> {
  const pattern = input.pattern.trim()
  if (pattern.length < 2 || pattern.length > 200) return { ok: false, error: 'Scrivi il testo da cercare (almeno 2 caratteri)' }
  if (input.amountMinCents !== null && input.amountMaxCents !== null && input.amountMinCents > input.amountMaxCents) return { ok: false, error: 'L’importo minimo supera il massimo' }
  const choice = findChoice(input.direction === 'in' ? 1 : -1, input.choiceKey)
  if (!choice) return { ok: false, error: 'Scegli cosa sono questi movimenti' }
  const target = await resolveChoice(db, choice)
  const { data, error } = await db
    .from('categorization_rules')
    .insert({
      name: `${input.direction === 'in' ? 'Entrate' : 'Uscite'} “${pattern}” → ${choice.label}`.slice(0, 80),
      origin: 'user',
      priority: 30,
      match_field: input.matchField,
      match_type: input.matchType,
      pattern,
      direction: input.direction,
      amount_min_cents: input.amountMinCents,
      amount_max_cents: input.amountMaxCents,
      set_type: choice.type,
      set_nature: choice.nature,
      set_category_id: target.categoryId,
      set_business_id: choice.type === 'transfer' || choice.type === 'investment' ? null : target.businessId,
      set_income_source_id: target.incomeSourceId,
      confidence: input.autoApply ? 0.95 : 0.7,
    })
    .select('id')
    .single()
  if (error) fail('Nuova regola', error)
  return { ok: true, id: data.id }
}

/** Crea la regola suggerita dalle correzioni (origine "imparata"). */
export async function createLearnedRule(db: DbClient, s: RuleSuggestion, label: string): Promise<RuleResult> {
  const { data, error } = await db
    .from('categorization_rules')
    .insert({
      name: `Imparata: “${s.pattern}” → ${label}`.slice(0, 80),
      origin: 'learned',
      priority: 20,
      match_field: 'description',
      match_type: 'contains',
      pattern: s.pattern,
      direction: s.direction,
      set_type: s.type,
      set_nature: s.nature,
      set_category_id: s.categoryId,
      set_business_id: s.businessId,
      set_income_source_id: s.incomeSourceId,
      confidence: s.confidence,
    })
    .select('id')
    .single()
  if (error) fail('Regola imparata', error)
  return { ok: true, id: data.id }
}

export async function setRuleActive(db: DbClient, id: string, isActive: boolean): Promise<boolean> {
  const { data, error } = await db.from('categorization_rules').update({ is_active: isActive }).eq('id', id).select('id')
  if (error) fail('Regola', error)
  return data.length === 1
}

/** Cambia l'affidabilità: applica da sola (≥ soglia) o proponi soltanto. */
export async function setRuleAutoApply(db: DbClient, id: string, autoApply: boolean): Promise<boolean> {
  const { data, error } = await db.from('categorization_rules').update({ confidence: autoApply ? 0.95 : 0.7 }).eq('id', id).select('id')
  if (error) fail('Regola', error)
  return data.length === 1
}

export async function deleteRule(db: DbClient, id: string): Promise<boolean> {
  const { data, error } = await db.from('categorization_rules').delete().eq('id', id).select('id')
  if (error) fail('Regola', error)
  return data.length === 1
}

type TxRow = {
  id: string
  description: string
  counterparty: string | null
  amount_cents: number
  account_id: string
  type: string
  nature: string
  category_id: string | null
  business_id: string | null
  income_source_id: string | null
  accounts: { default_bank_profile: string | null }
}

function inputFor(t: TxRow): ClassifyInput {
  const profile = t.accounts.default_bank_profile
  return {
    // Senza banca nota: nessuna regola limitata a una banca si applica.
    source: (profile ?? 'generic') as ImportSource,
    description: t.description,
    counterparty: t.counterparty,
    amount: Number(t.amount_cents),
    hint: null,
    movement: 'cash',
    accountId: t.account_id,
  } as ClassifyInput
}

const TX_COLUMNS = 'id, description, counterparty, amount_cents, account_id, type, nature, category_id, business_id, income_source_id, accounts!inner(default_bank_profile)'

/** Suggerimenti dalle correzioni a mano non ancora coperte da una regola attiva. */
export async function ruleSuggestions(db: DbClient): Promise<RuleSuggestion[]> {
  const [{ data, error }, classification] = await Promise.all([
    db.from('transactions').select(TX_COLUMNS).eq('categorization_method', 'manual').eq('is_categorized', true).order('booked_on', { ascending: false }).limit(SCAN_LIMIT),
    loadClassificationData(db),
  ])
  if (error) fail('Correzioni', error)
  const rows = (data as unknown as TxRow[]).filter((t) => classify(inputFor(t), classification.rules, classification.lookups).ruleDbId === null)
  const manual: ManualRow[] = rows.map((t) => ({
    description: t.description,
    amount: Number(t.amount_cents),
    type: t.type as ManualRow['type'],
    nature: t.nature as ManualRow['nature'],
    categoryId: t.category_id,
    businessId: t.business_id,
    incomeSourceId: t.income_source_id,
  }))
  return suggestRules(manual, () => false)
}

export type ApplyReport = { applied: number; proposed: number; untouched: number }

/**
 * Riapplica le regole attive ai movimenti da sistemare (non collegati a un
 * trasferimento). Sopra la soglia la classificazione è confermata; sotto
 * resta una proposta (is_categorized = false): mai un'applicazione
 * automatica sotto soglia.
 */
export async function applyRulesToPending(db: DbClient): Promise<ApplyReport> {
  const [{ data, error }, classification] = await Promise.all([
    db.from('transactions').select(TX_COLUMNS).eq('is_categorized', false).is('transfer_group_id', null).limit(SCAN_LIMIT),
    loadClassificationData(db),
  ])
  if (error) fail('Movimenti da sistemare', error)
  const report: ApplyReport = { applied: 0, proposed: 0, untouched: 0 }
  const hits = new Map<string, number>()
  for (const t of data as unknown as TxRow[]) {
    const c = classify(inputFor(t), classification.rules, classification.lookups)
    if (!c.type || !c.ruleDbId) {
      report.untouched += 1
      continue
    }
    const decision = applyDecision(c.confidence)
    const { error: e } = await db
      .from('transactions')
      .update({
        type: c.type,
        nature: c.nature ?? 'personal',
        category_id: c.categoryId,
        business_id: c.businessId,
        income_source_id: c.incomeSourceId,
        is_categorized: decision === 'apply',
        categorization_method: 'rule',
        categorization_confidence: c.confidence,
        categorization_rule_id: c.ruleDbId,
      })
      .eq('id', t.id)
      .eq('is_categorized', false)
    if (e) fail('Applicazione regola', e)
    report[decision === 'apply' ? 'applied' : 'proposed'] += 1
    hits.set(c.ruleDbId, (hits.get(c.ruleDbId) ?? 0) + 1)
  }
  for (const [ruleId, n] of hits) {
    const { data: rule } = await db.from('categorization_rules').select('hit_count').eq('id', ruleId).maybeSingle()
    if (rule) await db.from('categorization_rules').update({ hit_count: rule.hit_count + n, last_matched_at: new Date().toISOString() }).eq('id', ruleId)
  }
  return report
}

/** Quanti movimenti già importati corrisponderebbero a una regola (anteprima). */
export async function previewRuleMatches(db: DbClient, rule: Rule): Promise<number> {
  const [{ data, error }, classification] = await Promise.all([
    db.from('transactions').select(TX_COLUMNS).order('booked_on', { ascending: false }).limit(SCAN_LIMIT),
    loadClassificationData(db),
  ])
  if (error) fail('Anteprima regola', error)
  return (data as unknown as TxRow[]).filter((t) => classify(inputFor(t), [rule], classification.lookups).method === 'rule').length
}
