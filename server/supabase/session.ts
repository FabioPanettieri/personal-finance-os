import type { SupabaseClient } from '@supabase/supabase-js'

import type { AssuranceLevel, SessionState } from '@/lib/auth/access'

export type VerifiedUser = {
  id: string
  email: string | null
}

export type ResolvedSession = {
  state: SessionState
  user: VerifiedUser | null
}

function asLevel(value: unknown): AssuranceLevel {
  return value === 'aal2' ? 'aal2' : 'aal1'
}

/**
 * Stato della sessione per le decisioni di accesso.
 *
 * - identità e livello corrente vengono da getClaims(), che verifica la firma
 *   del JWT (o, con chiavi simmetriche, interroga Supabase Auth);
 * - nextLevel (esiste già un fattore TOTP?) viene dalla sessione e serve solo
 *   a scegliere tra /mfa/setup e /mfa/verify: non concede mai accesso.
 */
export async function resolveSession(supabase: SupabaseClient): Promise<ResolvedSession> {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) {
    return { state: { kind: 'anonymous' }, user: null }
  }

  const currentLevel = asLevel(claims.aal)
  let nextLevel: AssuranceLevel = currentLevel
  if (currentLevel === 'aal1') {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    nextLevel = asLevel(aal?.nextLevel)
  }

  return {
    state: { kind: 'authenticated', currentLevel, nextLevel },
    user: { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null },
  }
}
