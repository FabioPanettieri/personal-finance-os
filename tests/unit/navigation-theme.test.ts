import { describe, expect, it } from 'vitest'

import { PRIMARY_NAV, activePrimaryHref, isNavItemActive } from '@/lib/navigation'
import { DEFAULT_THEME_PREFERENCE, nextThemePreference, resolveTheme } from '@/lib/theme'

describe('navigazione', () => {
  it('ha 5 voci, con Importa come azione principale al centro', () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual(['Home', 'Movimenti', 'Importa', 'Conti', 'Business'])
    expect(PRIMARY_NAV.filter((item) => item.primary).map((item) => item.href)).toEqual(['/imports/new'])
  })

  it('la Home è attiva solo su "/"', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/transactions', '/')).toBe(false)
  })

  it('le sottopagine attivano la sezione, i prefissi simili no', () => {
    expect(isNavItemActive('/settings/security', '/settings')).toBe(true)
    expect(isNavItemActive('/settings-old', '/settings')).toBe(false)
  })

  it('evidenzia la voce giusta anche nelle sottopagine', () => {
    expect(activePrimaryHref('/accounts/abc')).toBe('/accounts')
    expect(activePrimaryHref('/transactions/abc')).toBe('/transactions')
    expect(activePrimaryHref('/imports')).toBe('/imports/new')
    expect(activePrimaryHref('/imports/123')).toBe('/imports/new')
    expect(activePrimaryHref('/settings/security')).toBeNull()
    expect(activePrimaryHref('/sconosciuta')).toBeNull()
  })
})

describe('tema', () => {
  it('senza scelta salvata il tema è scuro', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('dark')
  })

  it('risolve la preferenza di sistema', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('cicla automatico → chiaro → scuro', () => {
    expect(nextThemePreference('system')).toBe('light')
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('dark')).toBe('system')
  })
})

describe('investimenti', () => {
  it('la pagina Investimenti tiene evidenziata la voce Conti', () => {
    expect(activePrimaryHref('/investments')).toBe('/accounts')
  })

  it('i report tengono evidenziata la Home', () => {
    expect(activePrimaryHref('/reports')).toBe('/')
  })
})
