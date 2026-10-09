'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Rule } from '@/lib/categorization/rules'
import { parseAmountInput } from '@/lib/money/parse'
import { requireUser } from '@/server/auth/session'
import { categoryTree } from '@/server/repositories/dashboard'
import {
  applyRulesToPending,
  createLearnedRule,
  createRule,
  deleteRule,
  previewRuleMatches,
  ruleSuggestions,
  setRuleActive,
  setRuleAutoApply,
} from '@/server/repositories/rules'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type RuleFormState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate() {
  revalidatePath('/rules')
  revalidatePath('/transactions')
  revalidatePath('/')
}

const optionalAmount = (raw: FormDataEntryValue | null): number | null | string => {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const parsed = parseAmountInput(text)
  return parsed.ok ? Math.abs(parsed.value) : parsed.error
}

const ruleSchema = z.object({
  pattern: z.string().trim().min(2, 'Scrivi il testo da cercare (almeno 2 caratteri)').max(200),
  matchField: z.enum(['description', 'counterparty']),
  matchType: z.enum(['contains', 'starts_with', 'equals']),
  direction: z.enum(['in', 'out']),
  choiceKey: z.string().min(1, 'Scegli cosa sono questi movimenti').max(60),
  autoApply: z.enum(['yes', 'no']),
})

export async function createRuleAction(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  await requireUser()
  const parsed = ruleSchema.safeParse({
    pattern: formData.get('pattern'),
    matchField: formData.get('matchField'),
    matchType: formData.get('matchType'),
    direction: formData.get('direction'),
    choiceKey: formData.get(`choice-${formData.get('direction')}`) ?? '',
    autoApply: formData.get('autoApply'),
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const min = optionalAmount(formData.get('amountMin'))
  const max = optionalAmount(formData.get('amountMax'))
  if (typeof min === 'string' || typeof max === 'string') return { status: 'error', message: `Importo: ${(typeof min === 'string' ? min : max) as string}` }
  const db = await createSupabaseServerClient()
  const input = { ...parsed.data, autoApply: parsed.data.autoApply === 'yes', amountMinCents: min, amountMaxCents: max }
  const result = await createRule(db, input)
  if (!result.ok) return { status: 'error', message: result.error }
  const preview: Rule = {
    id: 'anteprima',
    dbId: null,
    name: 'anteprima',
    priority: 0,
    matchField: input.matchField,
    matchType: input.matchType,
    pattern: input.pattern,
    accountId: null,
    direction: input.direction,
    amountMinCents: min,
    amountMaxCents: max,
    setType: input.direction === 'in' ? 'income' : 'expense',
    setNature: null,
    confidence: 1,
  }
  const matches = await previewRuleMatches(db, preview)
  revalidate()
  return {
    status: 'done',
    message: `Regola creata. Corrisponde a ${matches === 1 ? '1 movimento' : `${matches} movimenti`} già importati: si applicherà ai prossimi import; per quelli da sistemare usa “Applica ai movimenti da sistemare”.`,
  }
}

export async function applyRulesAction(): Promise<RuleFormState> {
  await requireUser()
  const r = await applyRulesToPending(await createSupabaseServerClient())
  revalidate()
  if (r.applied + r.proposed === 0) return { status: 'done', message: 'Nessuna regola corrisponde ai movimenti da sistemare.' }
  return {
    status: 'done',
    message: `${r.applied} classificati${r.proposed > 0 ? `, ${r.proposed} con una proposta da confermare (regole che non si applicano da sole)` : ''}.`,
  }
}

export async function acceptSuggestionAction(pattern: string, direction: 'in' | 'out'): Promise<RuleFormState> {
  await requireUser()
  const db = await createSupabaseServerClient()
  // Ricalcolato sul server: nessun dato del suggerimento arriva dal browser.
  const suggestion = (await ruleSuggestions(db)).find((s) => s.pattern === pattern && s.direction === direction)
  if (!suggestion) return { status: 'error', message: 'Suggerimento non più valido.' }
  const tree = await categoryTree(db)
  const label = tree.find((c) => c.id === suggestion.categoryId)?.name ?? (suggestion.type === 'income' ? 'Entrata' : 'Spesa')
  const result = await createLearnedRule(db, suggestion, label)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: 'Regola creata.' }
}

export async function toggleRuleAction(id: string, isActive: boolean): Promise<RuleFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !(await setRuleActive(await createSupabaseServerClient(), id, isActive))) return { status: 'error', message: 'Regola non trovata.' }
  revalidate()
  return { status: 'done', message: isActive ? 'Regola attivata.' : 'Regola disattivata.' }
}

export async function autoApplyRuleAction(id: string, autoApply: boolean): Promise<RuleFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !(await setRuleAutoApply(await createSupabaseServerClient(), id, autoApply))) return { status: 'error', message: 'Regola non trovata.' }
  revalidate()
  return { status: 'done', message: autoApply ? 'Si applicherà da sola.' : 'Proporrà soltanto.' }
}

export async function deleteRuleAction(id: string): Promise<RuleFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !(await deleteRule(await createSupabaseServerClient(), id))) return { status: 'error', message: 'Regola non trovata.' }
  revalidate()
  return { status: 'done', message: 'Regola eliminata.' }
}
