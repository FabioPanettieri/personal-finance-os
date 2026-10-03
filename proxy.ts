import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { decideAccess, type SessionState } from '@/lib/auth/access'
import { getSupabaseConfig } from '@/lib/env'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'
import { resolveSession } from '@/server/supabase/session'

/**
 * Proxy (ex middleware in Next.js 16), eseguito prima di ogni pagina:
 * 1. genera nonce + Content-Security-Policy;
 * 2. rinnova la sessione Supabase e riscrive i cookie;
 * 3. applica le regole di accesso (lib/auth/access.ts).
 * I layout server ripetono il controllo: il proxy non è l'unica barriera.
 */
export async function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const supabaseConfig = getSupabaseConfig()
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    supabaseUrl: supabaseConfig.configured ? supabaseConfig.config.url : null,
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  let session: SessionState = { kind: 'unconfigured' }

  if (supabaseConfig.configured) {
    const supabase = createServerClient(supabaseConfig.config.url, supabaseConfig.config.publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
        },
      },
    })
    session = (await resolveSession(supabase)).state
  }

  const decision = decideAccess(request.nextUrl.pathname, session, request.nextUrl.search)

  if (decision.action === 'redirect') {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url))
    // Mantiene i cookie di sessione eventualmente rinnovati (o cancellati).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    response = redirect
  }

  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
