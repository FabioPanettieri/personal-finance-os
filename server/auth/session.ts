import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { ROUTES, loginUrlFor, mfaStepFor } from '@/lib/auth/access'
import { getSupabaseConfig } from '@/lib/env'
import { createSupabaseServerClient } from '@/server/supabase/server'
import { resolveSession, type ResolvedSession, type VerifiedUser } from '@/server/supabase/session'
import type { Profile } from '@/types/domain'

/** Stato auth della richiesta corrente, calcolato una sola volta per render. */
export const getAuth = cache(async (): Promise<ResolvedSession> => {
  if (!getSupabaseConfig().configured) {
    return { state: { kind: 'unconfigured' }, user: null }
  }
  const supabase = await createSupabaseServerClient()
  return resolveSession(supabase)
})

/**
 * Barriera per pagine e server action dell'area app: restituisce l'utente
 * solo con sessione AAL2 verificata, altrimenti reindirizza.
 */
export async function requireUser(nextPath?: string): Promise<VerifiedUser> {
  const { state, user } = await getAuth()
  if (state.kind !== 'authenticated' || !user) redirect(loginUrlFor(nextPath ?? null))
  const step = mfaStepFor(state)
  if (step) redirect(step)
  return user
}

/** Barriera per le pagine MFA: serve una sessione, anche solo AAL1. */
export async function requireSession(): Promise<VerifiedUser> {
  const { state, user } = await getAuth()
  if (state.kind !== 'authenticated' || !user) redirect(ROUTES.login)
  return user
}

/**
 * Profilo dell'utente (creato dal trigger di signup, migration 0004).
 * null se il database non è ancora migrato o il profilo manca: la UI ripiega
 * sull'email, senza bloccare l'app.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) {
    console.error('[auth] lettura profilo fallita', { code: error.code })
    return null
  }
  return data
})
