'use server'

import { revalidatePath } from 'next/cache'

import { fieldErrorsFrom, type FormState } from '@/features/auth/schemas'
import { requireUser } from '@/server/auth/session'
import { setAccountActive, updateAccount } from '@/server/repositories/accounts'
import { createSupabaseServerClient } from '@/server/supabase/server'

import { accountIdSchema, accountUpdateSchema } from './schemas'

export type AccountFormState = FormState & {
  savedAt?: number
  /** Valori inviati, restituiti in caso d'errore: React 19 azzera il form dopo l'action. */
  values?: Record<'name' | 'institution' | 'iban' | 'color' | 'initialBalance' | 'initialBalanceOn', string>
}

function submittedValues(formData: FormData): NonNullable<AccountFormState['values']> {
  const text = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }
  return {
    name: text('name'),
    institution: text('institution'),
    iban: text('iban'),
    color: text('color'),
    initialBalance: text('initialBalance'),
    initialBalanceOn: text('initialBalanceOn'),
  }
}

function revalidateAccount(id: string) {
  revalidatePath('/accounts')
  revalidatePath(`/accounts/${id}`)
  revalidatePath('/')
}

export async function updateAccountAction(
  accountId: string,
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  await requireUser()
  if (!accountIdSchema.safeParse(accountId).success) return { status: 'error', message: 'Conto non trovato.' }

  const values = submittedValues(formData)
  const parsed = accountUpdateSchema.safeParse(values)
  if (!parsed.success) return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error), values }

  const result = await updateAccount(await createSupabaseServerClient(), accountId, parsed.data)
  if (!result.ok) {
    if (result.reason === 'duplicate_name') return { status: 'error', fieldErrors: { name: 'Esiste già un conto con questo nome' }, values }
    if (result.reason === 'duplicate_iban') return { status: 'error', fieldErrors: { iban: 'IBAN già associato a un altro conto' }, values }
    return { status: 'error', message: 'Conto non trovato.', values }
  }

  revalidateAccount(accountId)
  return { status: 'idle', message: 'Modifiche salvate.', savedAt: Date.now() }
}

export async function setAccountActiveAction(
  accountId: string,
  isActive: boolean,
): Promise<AccountFormState> {
  await requireUser()
  if (!accountIdSchema.safeParse(accountId).success) return { status: 'error', message: 'Conto non trovato.' }

  const result = await setAccountActive(await createSupabaseServerClient(), accountId, isActive)
  if (!result.ok) return { status: 'error', message: 'Conto non trovato.' }

  revalidateAccount(accountId)
  return { status: 'idle', message: isActive ? 'Conto riattivato.' : 'Conto disattivato.', savedAt: Date.now() }
}
