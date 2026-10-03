import { describe, expect, it } from 'vitest'

import { parseSupabaseConfig } from '@/lib/env'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'

const KEY = 'sb_publishable_0123456789abcdefghij'

describe('parseSupabaseConfig', () => {
  it('segnala le variabili mancanti', () => {
    expect(parseSupabaseConfig({ url: undefined, publishableKey: '' })).toEqual({
      configured: false,
      missing: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
      invalid: [],
    })
  })

  it('rifiuta valori malformati', () => {
    const result = parseSupabaseConfig({ url: 'not a url', publishableKey: 'short' })
    expect(result).toMatchObject({ configured: false, invalid: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] })
    expect(parseSupabaseConfig({ url: 'ftp://x.supabase.co', publishableKey: KEY }).configured).toBe(false)
    expect(parseSupabaseConfig({ url: 'https://x.supabase.co/', publishableKey: KEY }).configured).toBe(false)
  })

  it('accetta progetto cloud e stack locale', () => {
    expect(parseSupabaseConfig({ url: 'https://abcd.supabase.co', publishableKey: KEY })).toEqual({
      configured: true,
      config: { url: 'https://abcd.supabase.co', publishableKey: KEY },
    })
    expect(parseSupabaseConfig({ url: ' http://127.0.0.1:54321 ', publishableKey: KEY }).configured).toBe(true)
  })
})

describe('buildContentSecurityPolicy', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false, supabaseUrl: 'https://abcd.supabase.co' })

  it('consente script solo con nonce, niente eval in produzione', () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
  })

  it('limita le connessioni all’origine Supabase', () => {
    expect(csp).toContain("connect-src 'self' https://abcd.supabase.co wss://abcd.supabase.co")
  })

  it('blocca framing, plugin e form verso l’esterno', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('in sviluppo abilita eval (richiesto da React) e HMR', () => {
    const dev = buildContentSecurityPolicy({ nonce: 'n', isDev: true, supabaseUrl: null })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).toContain('ws:')
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('genera nonce casuali e distinti', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
    expect(atob(a)).toHaveLength(16)
  })
})
