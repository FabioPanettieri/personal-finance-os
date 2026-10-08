'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/server/auth/session'
import { classifyTransaction, confirmTransaction } from '@/server/repositories/transactions'
import { linkTransfer, unlinkTransfer } from '@/server/repositories/transfers'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ConfirmState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate(id: string) {
  revalidatePath(`/transactions/${id}`)
  // Anche l'altra metà di un trasferimento cambia.
  revalidatePath('/transactions/[id]', 'page')
  revalidatePath('/transactions')
  revalidatePath('/accounts')
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
  const parts = ['Fatto.']
  if (result.linked) parts.push('Collegato all’altra metà del trasferimento.')
  if (result.ruleCreated) parts.push('Lo ricorderò per i prossimi movimenti uguali.')
  return { status: 'done', message: parts.join(' ') }
}

/** Collega il movimento all'altra metà scelta: un trasferimento tra conti propri. */
export async function linkTransferAction(id: string, otherId: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(otherId).success) return { status: 'error', message: 'Movimento non trovato.' }
  const result = await linkTransfer(await createSupabaseServerClient(), id, otherId)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  return { status: 'done', message: 'Trasferimento collegato.' }
}

/** Scollega le due metà: restano trasferimenti "da abbinare". */
export async function unlinkTransferAction(id: string, groupId: string): Promise<ConfirmState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(groupId).success) return { status: 'error', message: 'Trasferimento non trovato.' }
  const result = await unlinkTransfer(await createSupabaseServerClient(), groupId)
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate(id)
  return { status: 'done', message: 'Trasferimento scollegato.' }
}
