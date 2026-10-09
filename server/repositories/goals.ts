import { isIsoDate, type IsoDate } from '@/lib/dates'

import { RepositoryError, type DbClient } from './accounts'

/** Obiettivi e conti collegati. Sempre con il client dell'utente (RLS + AAL2). */

function fail(context: string, error: { message: string; code?: string }): never {
  throw new RepositoryError(`${context}: ${error.message}`, error.code)
}

export type Goal = {
  id: string
  name: string
  targetCents: number
  manualCents: number
  tracking: 'manual' | 'linked_accounts'
  deadline: IsoDate | null
  isArchived: boolean
  links: { accountId: string; shareBps: number }[]
}

export async function listGoals(db: DbClient, { archived = false } = {}): Promise<Goal[]> {
  const { data, error } = await db
    .from('goals')
    .select('id, name, target_amount_cents, current_amount_cents, tracking, deadline, is_archived, goal_accounts(account_id, share_bps)')
    .eq('is_archived', archived)
    .order('sort_order')
    .order('created_at')
  if (error) fail('Obiettivi', error)
  return data.map((g) => ({
    id: g.id,
    name: g.name,
    targetCents: Number(g.target_amount_cents),
    manualCents: Number(g.current_amount_cents),
    tracking: g.tracking,
    deadline: g.deadline && isIsoDate(g.deadline) ? g.deadline : null,
    isArchived: g.is_archived,
    links: (g.goal_accounts ?? []).map((l) => ({ accountId: l.account_id, shareBps: l.share_bps })),
  }))
}

export type GoalInput = {
  name: string
  targetCents: number
  deadline: IsoDate | null
  tracking: 'manual' | 'linked_accounts'
  manualCents: number
  links: { accountId: string; shareBps: number }[]
}

export type GoalResult = { ok: true; id: string } | { ok: false; error: string }

function validate(input: GoalInput): string | null {
  if (input.name.trim().length < 1 || input.name.trim().length > 80) return 'Dai un nome all’obiettivo (massimo 80 caratteri)'
  if (!(input.targetCents > 0)) return 'L’obiettivo deve essere maggiore di zero'
  if (input.manualCents < 0) return 'L’importo raggiunto non può essere negativo'
  if (input.tracking === 'linked_accounts' && input.links.length === 0) return 'Scegli almeno un conto'
  if (input.links.some((l) => !(l.shareBps >= 1 && l.shareBps <= 10000))) return 'La quota di ogni conto va da 1% a 100%'
  return null
}

async function replaceLinks(db: DbClient, goalId: string, input: GoalInput): Promise<string | null> {
  const { error: del } = await db.from('goal_accounts').delete().eq('goal_id', goalId)
  if (del) fail('Conti dell’obiettivo', del)
  if (input.tracking !== 'linked_accounts') return null
  const { error } = await db.from('goal_accounts').insert(input.links.map((l) => ({ goal_id: goalId, account_id: l.accountId, share_bps: l.shareBps })))
  if (error) return error.code === '23503' ? 'Conto non trovato' : 'Conti non salvati, riprova.'
  return null
}

export async function createGoal(db: DbClient, input: GoalInput): Promise<GoalResult> {
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }
  const { data, error } = await db
    .from('goals')
    .insert({
      name: input.name.trim(),
      target_amount_cents: input.targetCents,
      current_amount_cents: input.tracking === 'manual' ? input.manualCents : 0,
      tracking: input.tracking,
      deadline: input.deadline,
    })
    .select('id')
    .single()
  if (error) fail('Nuovo obiettivo', error)
  const linkError = await replaceLinks(db, data.id, input)
  if (linkError) {
    await db.from('goals').delete().eq('id', data.id)
    return { ok: false, error: linkError }
  }
  return { ok: true, id: data.id }
}

export async function updateGoal(db: DbClient, id: string, input: GoalInput): Promise<GoalResult> {
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }
  const { data, error } = await db
    .from('goals')
    .update({
      name: input.name.trim(),
      target_amount_cents: input.targetCents,
      current_amount_cents: input.tracking === 'manual' ? input.manualCents : 0,
      tracking: input.tracking,
      deadline: input.deadline,
    })
    .eq('id', id)
    .select('id')
  if (error) fail('Modifica obiettivo', error)
  if (data.length === 0) return { ok: false, error: 'Obiettivo non trovato' }
  const linkError = await replaceLinks(db, id, input)
  return linkError ? { ok: false, error: linkError } : { ok: true, id }
}

/** Aggiunge (o toglie, se negativo) un importo a un obiettivo manuale; mai sotto zero. */
export async function addToGoal(db: DbClient, id: string, deltaCents: number): Promise<GoalResult> {
  const { data: goal, error } = await db.from('goals').select('current_amount_cents, tracking').eq('id', id).maybeSingle()
  if (error) fail('Obiettivo', error)
  if (!goal) return { ok: false, error: 'Obiettivo non trovato' }
  if (goal.tracking !== 'manual') return { ok: false, error: 'Questo obiettivo segue i saldi dei conti' }
  const next = Number(goal.current_amount_cents) + deltaCents
  if (next < 0) return { ok: false, error: 'Non puoi togliere più di quanto hai messo' }
  const { error: e } = await db.from('goals').update({ current_amount_cents: next }).eq('id', id)
  if (e) fail('Obiettivo', e)
  return { ok: true, id }
}

export async function setGoalArchived(db: DbClient, id: string, archived: boolean): Promise<boolean> {
  const { data, error } = await db.from('goals').update({ is_archived: archived }).eq('id', id).select('id')
  if (error) fail('Obiettivo', error)
  return data.length === 1
}

export async function deleteGoal(db: DbClient, id: string): Promise<boolean> {
  const { data, error } = await db.from('goals').delete().eq('id', id).select('id')
  if (error) fail('Obiettivo', error)
  return data.length === 1
}
