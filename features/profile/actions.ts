'use server'

import { revalidatePath } from 'next/cache'

import { isValidTimeZone } from '@/lib/dates/time-zones'
import { requireUser } from '@/server/auth/session'
import { createSupabaseServerClient } from '@/server/supabase/server'

export type ProfileFormState = { status: 'idle' | 'error' | 'done'; message?: string }

/** Nome mostrato nel saluto e fuso orario usato per "oggi", mesi e report. */
export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireUser()
  const name = String(formData.get('displayName') ?? '').trim()
  const timeZone = String(formData.get('timezone') ?? '').trim()
  if (name.length > 80) return { status: 'error', message: 'Il nome può avere al massimo 80 caratteri.' }
  if (!isValidTimeZone(timeZone)) return { status: 'error', message: 'Fuso orario non valido.' }

  const db = await createSupabaseServerClient()
  const { error } = await db
    .from('profiles')
    .update({ display_name: name || null, timezone: timeZone })
    .eq('id', user.id)
  if (error) {
    console.error('[profile] aggiornamento fallito', { code: error.code })
    return { status: 'error', message: 'Non è stato possibile salvare. Riprova.' }
  }
  revalidatePath('/', 'layout')
  return { status: 'done', message: 'Profilo salvato.' }
}
