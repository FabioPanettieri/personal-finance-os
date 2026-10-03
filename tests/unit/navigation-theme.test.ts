import { describe, expect, it } from 'vitest'

import { PRIMARY_NAV, activePrimaryHref, isNavItemActive } from '@/lib/navigation'
import { nextThemePreference, resolveTheme } from '@/lib/theme'

describe('navigazione', () => {
  it('ha le 5 voci primarie della specifica, nell’ordine', () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual(['Home', 'Transazioni', 'Patrimonio', 'Analytics', 'Impostazioni'])
  })

  it('la Home è attiva solo su "/"', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/transactions', '/')).toBe(false)
  })

  it('le sottopagine attivano la sezione, i prefissi simili no', () => {
    expect(isNavItemActive('/settings/security', '/settings')).toBe(true)
    expect(isNavItemActive('/settings-old', '/settings')).toBe(false)
  })

  it('su mobile le sezioni secondarie evidenziano la voce primaria corretta', () => {
    expect(activePrimaryHref('/accounts')).toBe('/net-worth')
    expect(activePrimaryHref('/investments')).toBe('/net-worth')
    expect(activePrimaryHref('/reports/annual')).toBe('/analytics')
    expect(activePrimaryHref('/imports')).toBe('/analytics')
    expect(activePrimaryHref('/settings/security')).toBe('/settings')
    expect(activePrimaryHref('/sconosciuta')).toBeNull()
  })
})

describe('tema', () => {
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
