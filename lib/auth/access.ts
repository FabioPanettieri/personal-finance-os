/**
 * Regole di accesso alle route. Funzioni pure, condivise da proxy.ts e dai
 * layout server (difesa in profondità): l'esito dipende solo dall'input.
 *
 * Modello (docs/02-security.md): nessuna registrazione pubblica, TOTP
 * obbligatorio. L'area app richiede una sessione AAL2 *verificata*.
 */

export const ROUTES = {
  home: '/',
  login: '/login',
  mfaSetup: '/mfa/setup',
  mfaVerify: '/mfa/verify',
} as const

export type AssuranceLevel = 'aal1' | 'aal2'

export type SessionState =
  | { kind: 'unconfigured' }
  | { kind: 'anonymous' }
  | {
      kind: 'authenticated'
      /** Da claim JWT verificato (getClaims): unica base per concedere accesso. */
      currentLevel: AssuranceLevel
      /** 'aal2' se l'utente ha già un fattore TOTP verificato. Decide solo *dove* reindirizzare. */
      nextLevel: AssuranceLevel
    }

export type RouteKind = 'public' | 'mfa' | 'app'

export type AccessDecision = { action: 'allow' } | { action: 'redirect'; to: string }

export function classifyRoute(pathname: string): RouteKind {
  if (pathname === ROUTES.login) return 'public'
  if (pathname === ROUTES.mfaSetup || pathname === ROUTES.mfaVerify) return 'mfa'
  return 'app'
}

/** Pagina a cui deve andare un utente autenticato che non ha ancora AAL2. */
export function mfaStepFor(session: Extract<SessionState, { kind: 'authenticated' }>): string | null {
  if (session.currentLevel === 'aal2') return null
  return session.nextLevel === 'aal2' ? ROUTES.mfaVerify : ROUTES.mfaSetup
}

export function decideAccess(pathname: string, session: SessionState, search = ''): AccessDecision {
  const route = classifyRoute(pathname)

  if (session.kind !== 'authenticated') {
    if (route === 'public') return { action: 'allow' }
    // Fail closed: senza Supabase configurato nessuna pagina protetta è raggiungibile.
    return { action: 'redirect', to: loginUrlFor(route === 'app' ? pathname + search : null) }
  }

  const step = mfaStepFor(session)

  if (step === null) {
    // Sessione completa: login e pagine MFA non servono più.
    return route === 'app' ? { action: 'allow' } : { action: 'redirect', to: ROUTES.home }
  }

  if (route === 'app' || route === 'public') return { action: 'redirect', to: step }
  return pathname === step ? { action: 'allow' } : { action: 'redirect', to: step }
}

export function loginUrlFor(next: string | null): string {
  const safe = safeNextPath(next)
  return safe === ROUTES.home ? ROUTES.login : `${ROUTES.login}?next=${encodeURIComponent(safe)}`
}

/**
 * Evita open redirect: accetta solo percorsi interni assoluti ("/x"), mai
 * "//host", "/\host", schemi o caratteri di controllo.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return ROUTES.home
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return ROUTES.home
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return ROUTES.home
  if (classifyRoute(next.split('?')[0] ?? next) !== 'app') return ROUTES.home
  return next
}
