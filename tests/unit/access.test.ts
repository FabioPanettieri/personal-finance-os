import { describe, expect, it } from 'vitest'

import { classifyRoute, decideAccess, loginUrlFor, safeNextPath, type SessionState } from '@/lib/auth/access'

const anonymous: SessionState = { kind: 'anonymous' }
const unconfigured: SessionState = { kind: 'unconfigured' }
const full: SessionState = { kind: 'authenticated', currentLevel: 'aal2', nextLevel: 'aal2' }
const needsVerify: SessionState = { kind: 'authenticated', currentLevel: 'aal1', nextLevel: 'aal2' }
const needsSetup: SessionState = { kind: 'authenticated', currentLevel: 'aal1', nextLevel: 'aal1' }

describe('classifyRoute', () => {
  it('distingue login, pagine MFA e area app', () => {
    expect(classifyRoute('/login')).toBe('public')
    expect(classifyRoute('/mfa/setup')).toBe('mfa')
    expect(classifyRoute('/mfa/verify')).toBe('mfa')
    expect(classifyRoute('/')).toBe('app')
    expect(classifyRoute('/settings/security')).toBe('app')
    // Nessuna route "pubblica" per somiglianza di prefisso.
    expect(classifyRoute('/login-evil')).toBe('app')
    expect(classifyRoute('/login/x')).toBe('app')
  })
})

describe('decideAccess — utente non autenticato', () => {
  it('reindirizza al login conservando la destinazione', () => {
    expect(decideAccess('/transactions', anonymous, '?category=casa')).toEqual({
      action: 'redirect',
      to: '/login?next=%2Ftransactions%3Fcategory%3Dcasa',
    })
    expect(decideAccess('/', anonymous)).toEqual({ action: 'redirect', to: '/login' })
  })

  it('permette solo il login', () => {
    expect(decideAccess('/login', anonymous)).toEqual({ action: 'allow' })
    expect(decideAccess('/mfa/setup', anonymous)).toEqual({ action: 'redirect', to: '/login' })
  })

  it('fail closed se Supabase non è configurato', () => {
    expect(decideAccess('/', unconfigured)).toEqual({ action: 'redirect', to: '/login' })
    expect(decideAccess('/settings', unconfigured).action).toBe('redirect')
    expect(decideAccess('/login', unconfigured)).toEqual({ action: 'allow' })
  })
})

describe('decideAccess — MFA obbligatoria', () => {
  it('senza fattore TOTP porta alla configurazione', () => {
    expect(decideAccess('/', needsSetup)).toEqual({ action: 'redirect', to: '/mfa/setup' })
    expect(decideAccess('/mfa/verify', needsSetup)).toEqual({ action: 'redirect', to: '/mfa/setup' })
    expect(decideAccess('/mfa/setup', needsSetup)).toEqual({ action: 'allow' })
  })

  it('con fattore ma sessione AAL1 chiede il codice', () => {
    expect(decideAccess('/transactions', needsVerify)).toEqual({ action: 'redirect', to: '/mfa/verify' })
    expect(decideAccess('/login', needsVerify)).toEqual({ action: 'redirect', to: '/mfa/verify' })
    expect(decideAccess('/mfa/setup', needsVerify)).toEqual({ action: 'redirect', to: '/mfa/verify' })
    expect(decideAccess('/mfa/verify', needsVerify)).toEqual({ action: 'allow' })
  })

  it('sessione AAL2: area app libera, login e MFA rimandano alla Home', () => {
    expect(decideAccess('/', full)).toEqual({ action: 'allow' })
    expect(decideAccess('/settings/security', full)).toEqual({ action: 'allow' })
    expect(decideAccess('/login', full)).toEqual({ action: 'redirect', to: '/' })
    expect(decideAccess('/mfa/verify', full)).toEqual({ action: 'redirect', to: '/' })
  })
})

describe('safeNextPath — nessun open redirect', () => {
  it.each([
    ['/transactions?x=1', '/transactions?x=1'],
    ['/', '/'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/%0d%0aSet-Cookie', '/%0d%0aSet-Cookie'],
    ['/ok\r\nLocation: x', '/'],
    ['javascript:alert(1)', '/'],
    ['/login', '/'],
    ['/mfa/setup', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it('loginUrlFor non aggiunge next per la Home', () => {
    expect(loginUrlFor('/')).toBe('/login')
    expect(loginUrlFor('//evil')).toBe('/login')
    expect(loginUrlFor('/goals')).toBe('/login?next=%2Fgoals')
  })
})
