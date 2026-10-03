'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/server/auth/session'
import { confirmTransaction } from '@/server/repositories/transactions'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ConfirmState = { status: 'idle' | 'error' | 'done'; message?: string }

/** Conferma la classificazione proposta di un movimento (RLS: solo i propri). */
export async function confirmTransactionAction(id: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Movimento non trovato.' }
  const ok = await confirmTransaction(await createSupabaseServerClient(), id)
  if (!ok) return { status: 'error', message: 'Movimento non trovato o già confermato.' }
  revalidatePath(`/transactions/${id}`)
  revalidatePath('/transactions')
  revalidatePath('/')
  return { status: 'done', message: 'Classificazione confermata.' }
}
