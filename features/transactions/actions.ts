'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/server/auth/session'
import { classifyTransaction, confirmTransaction } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ConfirmState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate(id: string) {
  revalidatePath(`/transactions/${id}`)
  revalidatePath('/transactions')
  revalidatePath('/')
  revalidatePath('/business')
}

/** Conferma la classificazione proposta di un movimento (RLS: solo i propri). */
export async function confirmTransactionAction(id: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const ok = await confirmTransaction(await createSupabaseServerClient(), id)
  if (!ok) return { status: 'error', message: 'Movimento non trovato o già confermato.' }
  revalidate(id)
  return { status: 'done', message: 'Classificazione confermata.' }
}

/** "Sistema" un movimento con una scelta rapida (ed eventualmente ricordala). */
export async function classifyTransactionAction(id: string, _prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const choice = formData.get('choice')
  if (typeof choice !== 'string' || choice.length > 60) return { status: 'error', message: 'Scegli un’opzione.' }
  const remember = formData.get('remember') === 'on'
  const result = await classifyTransaction(await createSupabaseServerClient(), id, choice, remember)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  return { status: 'done', message: result.ruleCreated ? 'Fatto. Lo ricorderò per i prossimi movimenti uguali.' : 'Fatto.' }
}
