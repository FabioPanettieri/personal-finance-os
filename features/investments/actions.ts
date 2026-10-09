'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { DEFAULT_TIME_ZONE, isIsoDate, today, type IsoDate } from '@/lib/dates'
import { parseAmountInput } from '@/lib/money/parse'
import { getProfile, requireUser } from '@/server/auth/session'
import { createPlan, deletePlan, parseUnitPrice, savePrice, setPlanActive } from '@/server/repositories/investments'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type FormState = { status: 'idle' | 'error' | 'done'; message?: string }

function revalidate() {
  revalidatePath('/investments')
  revalidatePath('/')
  revalidatePath('/accounts')
}

/** Prezzo attuale di uno strumento (oggi). La quantità serve solo alla fotografia del valore. */
export async function savePriceAction(accountId: string, instrumentId: string, quantity: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  if (!z.uuid().safeParse(accountId).success || !z.uuid().safeParse(instrumentId).success || !(quantity >= 0)) return { status: 'error', message: 'Strumento non trovato.' }
  const raw = formData.get('price')
  const unitPrice = typeof raw === 'string' ? parseUnitPrice(raw) : null
  if (unitPrice === null) return { status: 'error', message: 'Prezzo non valido (es. 95,40)' }
  const profile = await getProfile()
  const result = await savePrice(await createSupabaseServerClient(), { accountId, instrumentId, unitPrice, quantity, valuedOn: today(profile?.timezone ?? DEFAULT_TIME_ZONE) })
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: 'Prezzo aggiornato.' }
}

const planSchema = z.object({
  name: z.string().trim().min(1, 'Dai un nome al piano').max(80),
  instrumentId: z.union([z.uuid(), z.literal('')]),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']),
  startsOn: z.string().refine(isIsoDate, 'Data non valida'),
})

export async function createPlanAction(accountId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  if (!z.uuid().safeParse(accountId).success) return { status: 'error', message: 'Conto non trovato.' }
  const parsed = planSchema.safeParse({
    name: formData.get('name'),
    instrumentId: formData.get('instrumentId') ?? '',
    frequency: formData.get('frequency'),
    startsOn: formData.get('startsOn'),
  })
  if (!parsed.success) return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Dati non validi.' }
  const amount = parseAmountInput(String(formData.get('amount') ?? ''))
  if (!amount.ok) return { status: 'error', message: amount.error }
  if (amount.value <= 0) return { status: 'error', message: 'L’importo deve essere positivo' }
  const result = await createPlan(await createSupabaseServerClient(), {
    accountId,
    instrumentId: parsed.data.instrumentId || null,
    name: parsed.data.name,
    amountCents: amount.value,
    frequency: parsed.data.frequency,
    startsOn: parsed.data.startsOn as IsoDate,
  })
  if (!result.ok) return { status: 'error', message: result.error }
  revalidate()
  return { status: 'done', message: 'Piano aggiunto.' }
}

export async function togglePlanAction(id: string, isActive: boolean): Promise<FormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Piano non trovato.' }
  const ok = await setPlanActive(await createSupabaseServerClient(), id, isActive)
  if (!ok) return { status: 'error', message: 'Piano non trovato.' }
  revalidate()
  return { status: 'done', message: isActive ? 'Piano riattivato.' : 'Piano in pausa.' }
}

export async function deletePlanAction(id: string): Promise<FormState> {
  await requireUser()
  if (!z.uuid().safeParse(id).success) return { status: 'error', message: 'Piano non trovato.' }
  const ok = await deletePlan(await createSupabaseServerClient(), id)
  if (!ok) return { status: 'error', message: 'Piano non trovato.' }
  revalidate()
  return { status: 'done', message: 'Piano eliminato.' }
}
