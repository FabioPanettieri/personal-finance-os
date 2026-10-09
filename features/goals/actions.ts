'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { isIsoDate, type IsoDate } from '@/lib/dates'
import { parseAmountInput } from '@/lib/money/parse'
import { requireUser } from '@/server/auth/session'
import { addToGoal, createGoal, deleteGoal, setGoalArchived, updateGoal, type GoalInput } from '@/server/repositories/goals'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type GoalFormState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate() {
  revalidatePath('/goals')
  revalidatePath('/')
}

/** Legge il form dell'obiettivo: importi in formato italiano, conti con quota in %. */
function parseGoalForm(formData: FormData): GoalInput | string {
  const text = (k: string) => String(formData.get(k) ?? '').trim()
  const target = parseAmountInput(text('target'))
  if (!target.ok) return `Obiettivo: ${target.error.toLowerCase()}`
  const tracking = text('tracking') === 'linked_accounts' ? 'linked_accounts' : 'manual'
  let manualCents = 0
  if (tracking === 'manual' && text('current')) {
    const current = parseAmountInput(text('current'))
    if (!current.ok) return `Già messo da parte: ${current.error.toLowerCase()}`
    manualCents = current.value
  }
  const deadline = text('deadline')
  if (deadline && !isIsoDate(deadline)) return 'Data non valida'
  const links = formData
    .getAll('account')
    .filter((v): v is string => typeof v === 'string' && z.uuid().safeParse(v).success)
    .map((accountId) => {
      const percent = Number(String(formData.get(`share-${accountId}`) ?? '100').replace(',', '.'))
      return { accountId, shareBps: Math.round((Number.isFinite(percent) ? percent : 0) * 100) }
    })
  return { name: text('name'), targetCents: target.value, deadline: deadline ? (deadline as IsoDate) : null, tracking, manualCents, links }
}

export async function createGoalAction(_prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  await requireUser()
  const input = parseGoalForm(formData)
  if (typeof input === 'string') return { status: 'error', message: input }
  const result = await createGoal(await createSupabaseServerClient(), input)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: 'Obiettivo creato.' }
}

export async function updateGoalAction(id: string, _prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Obiettivo non trovato.' }
  const input = parseGoalForm(formData)
  if (typeof input === 'string') return { status: 'error', message: input }
  const result = await updateGoal(await createSupabaseServerClient(), id, input)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: 'Modifiche salvate.' }
}

/** "Aggiungi" o "Togli" un importo (obiettivi manuali). */
export async function addToGoalAction(id: string, _prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Obiettivo non trovato.' }
  const amount = parseAmountInput(String(formData.get('amount') ?? ''))
  if (!amount.ok) return { status: 'error', message: amount.error }
  const sign = formData.get('direction') === 'remove' ? -1 : 1
  const result = await addToGoal(await createSupabaseServerClient(), id, sign * Math.abs(amount.value))
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: sign > 0 ? 'Aggiunto.' : 'Tolto.' }
}

export async function archiveGoalAction(id: string, archived: boolean): Promise<GoalFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Obiettivo non trovato.' }
  const ok = await setGoalArchived(await createSupabaseServerClient(), id, archived)
  if (!ok) return { status: 'error', message: 'Obiettivo non trovato.' }
  revalidate()
  return { status: 'done', message: archived ? 'Obiettivo archiviato.' : 'Obiettivo ripristinato.' }
}

export async function deleteGoalAction(id: string): Promise<GoalFormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Obiettivo non trovato.' }
  const ok = await deleteGoal(await createSupabaseServerClient(), id)
  if (!ok) return { status: 'error', message: 'Obiettivo non trovato.' }
  revalidate()
  return { status: 'done', message: 'Obiettivo eliminato.' }
}
